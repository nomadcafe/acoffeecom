import { eq } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { session } from '../../_lib/db/schema';
import { getSessionContext, jsonError } from '../../_lib/passport';

export interface SessionWire {
  id: string;
  /** Best-effort device label parsed from UA (e.g., "iPhone Safari"). */
  device: string;
  ipAddress: string | null;
  createdAt: number;
  /** True if this row is the requesting browser's own session — the UI uses
   *  this to label it "this device" and gate the revoke button (revoking the
   *  current session signs you out, which we do via a different code path). */
  current: boolean;
}

function parseDevice(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';

  let platform = 'Unknown device';
  if (/\biPhone\b/.test(ua)) platform = 'iPhone';
  else if (/\biPad\b/.test(ua)) platform = 'iPad';
  else if (/\bAndroid\b/.test(ua)) platform = 'Android';
  else if (/\bMacintosh\b|Mac OS X/.test(ua)) platform = 'Mac';
  else if (/\bWindows\b/.test(ua)) platform = 'Windows';
  else if (/\bLinux\b/.test(ua)) platform = 'Linux';

  // Order matters: Edge contains "Safari", Chrome contains "Safari", etc.
  let browser = '';
  if (/\bEdg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/\bOPR\/|\bOpera\b/.test(ua)) browser = 'Opera';
  else if (/\bFirefox\//.test(ua)) browser = 'Firefox';
  else if (/\bCriOS\//.test(ua)) browser = 'Chrome';
  else if (/\bChrome\//.test(ua)) browser = 'Chrome';
  else if (/\bSafari\//.test(ua)) browser = 'Safari';

  return browser ? `${platform} ${browser}` : platform;
}

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const ctx = await getSessionContext(env, request);
  if (!ctx) return jsonError('Unauthorized', 401);

  const db = getDb(env);
  const rows = await db
    .select()
    .from(session)
    .where(eq(session.userId, ctx.user.id));

  const wire: SessionWire[] = rows
    .map((r) => ({
      id: r.id,
      device: parseDevice(r.userAgent),
      ipAddress: r.ipAddress ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt),
      current: r.id === ctx.sessionId,
    }))
    // Newest sessions first — easier to spot "is this me right now" at the top.
    .sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || b.createdAt - a.createdAt);

  return Response.json({ sessions: wire });
};
