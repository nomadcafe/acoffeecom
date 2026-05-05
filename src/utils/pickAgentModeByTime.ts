import type { AgentMode } from '../types';

/**
 * Default-mode logic for the agent when the user hasn't explicitly
 * picked one yet. The chip strip stays available for manual override —
 * this just decides which one is highlighted on first render so the
 * "AI agent picks the meeting" pitch isn't a lie at boot time.
 *
 * Buckets are intentionally coarse — the goal is "feels right" not
 * "captures every nuance":
 *
 *   05-09  fast    — morning rush, people running before work
 *   09-13  fair    — productive midday, balanced is the safe pick
 *   13-17  quiet   — afternoon work hours, want focus
 *   17-21  vibe    — evening / date / social time
 *   21-05  now     — late, opening hours dominate everything else
 *
 * `cheap` is intentionally never auto-picked: budget is a user
 * preference, not a time-of-day signal. Users who want cheap will
 * tap the chip themselves.
 */
export function pickAgentModeByTime(hour: number): AgentMode {
  if (hour >= 5 && hour < 9) return 'fast';
  if (hour >= 9 && hour < 13) return 'fair';
  if (hour >= 13 && hour < 17) return 'quiet';
  if (hour >= 17 && hour < 21) return 'vibe';
  return 'now';
}
