import { and, eq, gte } from 'drizzle-orm';
import { Resend } from 'resend';
import { getDb } from './db';
import { user, visitedShops } from './db/schema';
import type { AuthEnv } from './auth';

interface UserRecapStats {
  cups: number;
  shops: number;
  topShop: { name: string; visits: number } | null;
  cities: number;
  longestStreakInWindow: number;
}

/** Range covered by one recap run: previous calendar month (UTC). The 1st-of-month
 *  schedule means a run on May 1 covers all of April. */
export function previousMonthRange(now: Date = new Date()): { start: Date; end: Date; label: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0));
  const label = start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { start, end, label };
}

function parseVisits(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n) => typeof n === 'number' && Number.isFinite(n));
  } catch {
    return [];
  }
}

/** Longest run of consecutive UTC days with at least one visit, within the window. */
function longestStreak(visits: number[], windowStart: number, windowEnd: number): number {
  const days = new Set<number>();
  for (const ts of visits) {
    if (ts < windowStart || ts >= windowEnd) continue;
    days.add(Math.floor(ts / 86_400_000));
  }
  if (days.size === 0) return 0;
  const sorted = [...days].sort((a, b) => a - b);
  let best = 1;
  let cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      cur++;
      if (cur > best) best = cur;
    } else {
      cur = 1;
    }
  }
  return best;
}

async function loadStatsForUser(
  env: AuthEnv,
  userId: string,
  start: Date,
  end: Date,
): Promise<UserRecapStats> {
  const db = getDb(env);
  // Fetch alive rows whose updatedAt overlaps the window — visits inside the
  // visits[] JSON are time-filtered below. updatedAt filter is just a coarse
  // optimisation so we don't load the user's full history every month.
  const rows = await db
    .select()
    .from(visitedShops)
    .where(
      and(
        eq(visitedShops.userId, userId),
        eq(visitedShops.deleted, false),
        gte(visitedShops.updatedAt, start),
      ),
    );

  let cups = 0;
  const shopsWithVisits: { name: string; count: number }[] = [];
  const cities = new Set<string>();
  const allTimestamps: number[] = [];

  const startMs = start.getTime();
  const endMs = end.getTime();

  for (const r of rows) {
    const visits = parseVisits(r.visits).filter((ts) => ts >= startMs && ts < endMs);
    if (visits.length === 0) continue;
    cups += visits.length;
    shopsWithVisits.push({ name: r.name, count: visits.length });
    if (r.city && r.city.trim()) cities.add(r.city.trim());
    allTimestamps.push(...visits);
  }

  shopsWithVisits.sort((a, b) => b.count - a.count);
  const topShop = shopsWithVisits[0]
    ? { name: shopsWithVisits[0].name, visits: shopsWithVisits[0].count }
    : null;

  return {
    cups,
    shops: shopsWithVisits.length,
    topShop,
    cities: cities.size,
    longestStreakInWindow: longestStreak(allTimestamps, startMs, endMs),
  };
}

function recapHtml(opts: {
  email: string;
  monthLabel: string;
  stats: UserRecapStats;
  manageUrl: string;
}): string {
  const { monthLabel, stats, manageUrl } = opts;
  const topShopRow = stats.topShop
    ? `<p style="margin:18px 0 0;color:#5c4030;font-size:14px;line-height:1.5;">
        <span style="color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-size:11px;font-weight:600;">Most-visited café</span><br>
        <strong style="font-size:16px;">${escapeHtml(stats.topShop.name)}</strong> · ${stats.topShop.visits} cups
      </p>`
    : '';
  const streakRow =
    stats.longestStreakInWindow >= 2
      ? `<p style="margin:14px 0 0;color:#5c4030;font-size:14px;line-height:1.5;">
          <span style="color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-size:11px;font-weight:600;">Longest streak</span><br>
          <strong style="font-size:16px;">${stats.longestStreakInWindow} days</strong> in a row 🔥
        </p>`
      : '';
  const citiesRow =
    stats.cities > 1
      ? `<p style="margin:14px 0 0;color:#5c4030;font-size:14px;line-height:1.5;">
          <span style="color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-size:11px;font-weight:600;">Cities</span><br>
          <strong style="font-size:16px;">${stats.cities}</strong> different places
        </p>`
      : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;background:#faf6f1;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 26px;">
    <h1 style="margin:0 0 4px;font-size:22px;color:#2c1810;">Your ${escapeHtml(monthLabel)} in coffee ☕</h1>
    <p style="margin:0;color:#7a6a60;font-size:14px;">A quick recap of last month's stamps.</p>

    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:24px;border-collapse:separate;border-spacing:8px 0;">
      <tr>
        <td style="background:#faf6f1;border-radius:10px;padding:14px 8px;text-align:center;width:33%;">
          <div style="font-size:28px;font-weight:700;color:#2c1810;">${stats.cups}</div>
          <div style="font-size:11px;color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-top:2px;">Cups</div>
        </td>
        <td style="background:#faf6f1;border-radius:10px;padding:14px 8px;text-align:center;width:33%;">
          <div style="font-size:28px;font-weight:700;color:#2c1810;">${stats.shops}</div>
          <div style="font-size:11px;color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-top:2px;">Cafés</div>
        </td>
        <td style="background:#faf6f1;border-radius:10px;padding:14px 8px;text-align:center;width:33%;">
          <div style="font-size:28px;font-weight:700;color:#2c1810;">${stats.cities}</div>
          <div style="font-size:11px;color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-top:2px;">Cities</div>
        </td>
      </tr>
    </table>

    ${topShopRow}${streakRow}${citiesRow}

    <p style="margin:28px 0 0;font-size:13px;color:#7a6a60;line-height:1.5;">
      <a href="https://acoffee.com/" style="color:#a36b3e;text-decoration:none;font-weight:600;">Open ACoffee</a>
      &nbsp;·&nbsp;
      <a href="${manageUrl}" style="color:#a36b3e;text-decoration:none;">Manage email preferences</a>
    </p>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RunResult {
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Iterate users opted into monthly digest, compute their previous-month stats,
 * and send a recap email each. Skips users with zero cups in the window —
 * a "0 cups, 0 cafés" email is just noise. Returns counts so the caller can
 * surface a summary in the response.
 */
export async function runMonthlyRecap(env: AuthEnv, now: Date = new Date()): Promise<RunResult> {
  const { start, end, label } = previousMonthRange(now);
  const db = getDb(env);
  const recipients = await db
    .select({ id: user.id, email: user.email, optedIn: user.monthlyRecapEmail })
    .from(user)
    .where(eq(user.monthlyRecapEmail, true));

  const resend = new Resend(env.RESEND_API_KEY);
  const manageUrl = `${env.AUTH_BASE_URL}/account`;

  const result: RunResult = { considered: recipients.length, sent: 0, skipped: 0, failed: 0 };

  for (const r of recipients) {
    if (!r.email) {
      result.skipped++;
      continue;
    }
    const stats = await loadStatsForUser(env, r.id, start, end);
    if (stats.cups === 0) {
      result.skipped++;
      continue;
    }
    try {
      await resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: r.email,
        subject: `Your ${label} in coffee ☕ — ${stats.cups} cups, ${stats.shops} cafés`,
        html: recapHtml({ email: r.email, monthLabel: label, stats, manageUrl }),
      });
      result.sent++;
    } catch (e) {
      console.error('[recap] send failed for', r.email, e);
      result.failed++;
    }
  }

  return result;
}
