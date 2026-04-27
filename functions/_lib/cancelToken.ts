/**
 * HMAC-SHA256 token gating visitor-initiated booking cancellation.
 *
 * The cancel link in a visitor's confirmation email is just
 * `/booking/cancel?id=<bookingId>&t=<token>`. The booking row's UUID is
 * already unguessable on its own, but signing it with `AUTH_SECRET` means
 * we never have to put the token in a database column or trust an
 * accidentally-leaked booking id (e.g. a screenshot of the email).
 */

const ENC = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    ENC.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, ENC.encode(payload));
  return base64url(new Uint8Array(sig));
}

export async function makeCancelToken(secret: string, bookingId: string): Promise<string> {
  return sign(secret, `cancel:${bookingId}`);
}

/** Constant-time compare via XOR-of-codepoints — same length is also enforced. */
export async function verifyCancelToken(
  secret: string,
  bookingId: string,
  token: string,
): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0) return false;
  const expected = await makeCancelToken(secret, bookingId);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}
