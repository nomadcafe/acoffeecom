import { eq } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { user } from '../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../_lib/passport';

/**
 * Avatar upload + clear. Lives at `/api/account/avatar`.
 *
 *   POST: body is the raw image bytes (the client resizes to 512x512
 *         and converts to webp client-side, so server-side we just
 *         validate the content-type / size and stream into R2). The
 *         response sets user.image to the public R2 URL.
 *
 *   DELETE: clears user.image. We don't delete the R2 object — keeping
 *           it lets us revert if the user removes by mistake, and the
 *           bucket is dirt-cheap. Periodic GC of orphaned keys can be
 *           a cron later.
 *
 * Why raw body, not multipart: the client always sends one image, no
 * other fields. Saves the multipart parser churn on Workers and keeps
 * the upload path one stream-copy.
 */

const MAX_BYTES = 2 * 1024 * 1024; // 2MB hard cap. Real uploads after
                                    // client resize land <100KB; 2MB
                                    // is the "user shoved a raw HEIC"
                                    // safety net.
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function publicUrlFor(env: AuthEnv, key: string): string | null {
  if (!env.AVATARS_PUBLIC_URL) return null;
  // Avoid double-slash if the env var was set with a trailing slash.
  const base = env.AVATARS_PUBLIC_URL.replace(/\/+$/, '');
  return `${base}/${key}`;
}

/** R2 key for a user's avatar. We don't include a hash / version in the
 *  key — every upload overwrites in place. The browser cache busts via
 *  the user.image URL changing only when the path changes... actually
 *  it doesn't change here, so we append a `?v=ts` query in the response
 *  so the new image surfaces immediately. */
function avatarKey(userId: string): string {
  return `avatars/${userId}.webp`;
}

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser) return jsonError('Unauthorized', 401);

  if (!env.AVATARS || !env.AVATARS_PUBLIC_URL) {
    return jsonError('Avatar upload is not configured on this deployment', 503);
  }

  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!ACCEPTED_TYPES.has(contentType)) {
    return jsonError(
      `Unsupported image type. Accepts: ${[...ACCEPTED_TYPES].join(', ')}`,
      415,
    );
  }

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return jsonError('Image is too large (2MB max)', 413);
  }

  // Read into a buffer so we can size-check before R2 write. ArrayBuffer
  // copy is fine for ≤2MB; streaming would only matter at 100MB+.
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    return jsonError('Image is too large (2MB max)', 413);
  }
  if (buffer.byteLength === 0) {
    return jsonError('Empty body', 400);
  }

  /* Magic-byte sniff. The Content-Type header is attacker-controlled, so
   * trusting it alone means an attacker can upload arbitrary bytes
   * (HTML, SVG with script, etc.) labelled `image/webp` and R2 will
   * happily serve them under a public URL embedded in shared profiles
   * — a stored-XSS vector. We force `Content-Type: image/webp` on the
   * R2 object regardless, so modern browsers won't sniff, but pinning
   * the actual bytes to a known image format is the right defence in
   * depth. Magic numbers per the formats we accept above. */
  const head = new Uint8Array(buffer.slice(0, 12));
  const sniff: 'webp' | 'png' | 'jpeg' | null =
    // WebP: bytes 0-3 = 'RIFF' (52 49 46 46), 8-11 = 'WEBP'
    head.length >= 12 &&
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
      ? 'webp'
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      : head.length >= 8 &&
        head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
        head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
        ? 'png'
        // JPEG: FF D8 FF
        : head.length >= 3 &&
          head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
          ? 'jpeg'
          : null;
  if (sniff === null) {
    return jsonError('Image bytes do not match a supported format', 415);
  }
  // Header should match what the bytes actually are — disagreement is
  // either a bug or an attempted spoof. Hard-reject either way.
  const expectedType = `image/${sniff}`;
  if (contentType !== expectedType) {
    return jsonError(
      `Content-Type ${contentType} does not match the actual image format (${expectedType})`,
      415,
    );
  }

  const key = avatarKey(sessionUser.id);
  await env.AVATARS.put(key, buffer, {
    httpMetadata: {
      // Always webp on the wire because the client converts before upload.
      // If we ever accept jpeg/png raw, this needs to mirror contentType.
      contentType: 'image/webp',
      // 1-week edge cache — the URL changes via ?v= query on each upload,
      // so stale variants of the previous avatar won't stick.
      cacheControl: 'public, max-age=604800',
    },
  });

  // Bust browser / edge caches by appending a version query — same R2
  // key gets overwritten in place but anyone holding the old URL keeps
  // serving the old image until the cache expires.
  const url = publicUrlFor(env, key);
  if (!url) return jsonError('Avatar URL configuration missing', 500);
  const versioned = `${url}?v=${Date.now()}`;

  const db = getDb(env);
  await db.update(user).set({ image: versioned, updatedAt: new Date() }).where(eq(user.id, sessionUser.id));

  return Response.json({ image: versioned });
};

/** Clear the user's avatar. We only null out user.image; the R2 object
 *  stays so a future "undo" or accidental-delete recovery is possible.
 *  Storage is cheap; orphaned keys can be reaped by a cron later. */
export const onRequestDelete: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser) return jsonError('Unauthorized', 401);

  const db = getDb(env);
  await db.update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, sessionUser.id));

  return new Response(null, { status: 204 });
};
