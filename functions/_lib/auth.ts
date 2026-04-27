import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { Resend } from 'resend';
import { getDb, type DbEnv } from './db';

export interface AuthEnv extends DbEnv {
  AUTH_SECRET: string;
  AUTH_BASE_URL: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  /** Shared secret for the /api/cron/* endpoints. Set in CF dashboard. */
  CRON_SECRET?: string;
  /** Server-side Google Maps key — used for geocoding + Places searches
   *  triggered by booking flow. Falls back to VITE_GOOGLE_MAPS_API_KEY
   *  (which already exists for the client) so a fresh deploy works
   *  without a second env var. Production can add a separate key with
   *  IP / app restrictions later when leak hardening is worth the bother. */
  GOOGLE_MAPS_SERVER_KEY?: string;
  VITE_GOOGLE_MAPS_API_KEY?: string;
}

export function createAuth(env: AuthEnv) {
  const db = getDb(env);
  const resend = new Resend(env.RESEND_API_KEY);

  return betterAuth({
    database: drizzleAdapter(db, { provider: 'sqlite' }),
    secret: env.AUTH_SECRET,
    baseURL: env.AUTH_BASE_URL,
    user: {
      additionalFields: {
        username: { type: 'string', required: false },
        profilePublic: { type: 'boolean', required: false, defaultValue: false },
        monthlyRecapEmail: { type: 'boolean', required: false, defaultValue: true },
        displayName: { type: 'string', required: false },
        bio: { type: 'string', required: false },
        socialLinks: { type: 'string', required: false, defaultValue: '[]' },
        homeBaseAddress: { type: 'string', required: false },
        availabilitySlots: { type: 'string', required: false, defaultValue: '{}' },
        timezone: { type: 'string', required: false, defaultValue: 'UTC' },
        busyCalendarIcsUrl: { type: 'string', required: false },
        busyCalendarSyncedAt: { type: 'date', required: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30d
      updateAge: 60 * 60 * 24, // refresh once a day
    },
    plugins: [
      magicLink({
        expiresIn: 60 * 15, // 15 min
        sendMagicLink: async ({ email, url }) => {
          await resend.emails.send({
            from: env.RESEND_FROM_EMAIL,
            to: email,
            subject: 'Sign in to ACoffee',
            html: magicLinkEmailHtml(url),
          });
        },
      }),
    ],
  });
}

function magicLinkEmailHtml(url: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;max-width:480px;margin:40px auto;padding:0 20px;">
  <h2 style="margin-bottom:8px;">Sign in to ACoffee</h2>
  <p style="color:#555;line-height:1.5;">Click the button below to finish signing in. This link expires in 15 minutes and can be used once.</p>
  <p style="margin:32px 0;">
    <a href="${url}" style="display:inline-block;background:#a36b3e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:500;">Sign in</a>
  </p>
  <p style="color:#888;font-size:13px;line-height:1.5;">If the button doesn't work, paste this URL into your browser:<br><span style="word-break:break-all;">${url}</span></p>
  <p style="color:#888;font-size:13px;margin-top:32px;">If you didn't request this, you can ignore this email.</p>
</body>
</html>`;
}
