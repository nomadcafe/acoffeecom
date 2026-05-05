import type { Locale } from './messages';
import type { AgentMode } from '../types';

export interface ExamplePair {
  a: string;
  b: string;
  /** Optional agent mode applied before the sample search fires. Lets a
   *  prompt double as both an address-pair teaching aid AND an agent-mode
   *  teaching aid — clicking "✨ Date night" shows the user that vibe
   *  mode produces different rankings vs the fair-mode default. */
  mode?: AgentMode;
  /** Optional emoji prefix. Pairs with `mode` to make the chip's intent
   *  scannable at a glance. */
  emoji?: string;
}

/**
 * Per-locale demo address pairs for the first-run empty state. One click
 * fills both inputs, optionally sets an agent mode, and triggers a full
 * search so new users see the flow end-to-end without thinking up two
 * addresses or knowing that modes exist.
 *
 * Why include `mode`: anonymous visitors don't know the agent has six
 * personalities (fair/fast/vibe/quiet/cheap/now). The mode chips only
 * appear after a search runs. Tagging some sample prompts with a mode
 * means the first click can simultaneously demo "addresses → agent
 * picks" AND "agent picks differently per mode" — exactly the H5
 * onboarding nudge from the competitive-research roadmap.
 *
 * Pairs should be two recognisable landmarks in a single city so the
 * midpoint + nearby café search returns real results.
 */
export const examplePairsByLocale: Record<Locale, ExamplePair[]> = {
  en: [
    { emoji: '🤝', a: 'Times Square, New York', b: 'Central Park, New York', mode: 'fair' },
    { emoji: '✨', a: 'Ferry Building, San Francisco', b: 'Golden Gate Park, San Francisco', mode: 'vibe' },
    { emoji: '📚', a: 'Embarcadero, San Francisco', b: 'Mission District, San Francisco', mode: 'quiet' },
    { emoji: '⚡', a: 'Penn Station, New York', b: 'Grand Central, New York', mode: 'fast' },
  ],
  ja: [
    { emoji: '🤝', a: '新宿駅', b: '渋谷駅', mode: 'fair' },
    { emoji: '✨', a: '六本木', b: '表参道', mode: 'vibe' },
    { emoji: '📚', a: '東京駅', b: '神保町', mode: 'quiet' },
    { emoji: '⚡', a: '品川駅', b: '東京駅', mode: 'fast' },
  ],
  zh: [
    { emoji: '🤝', a: '国贸, 北京', b: '三里屯, 北京', mode: 'fair' },
    { emoji: '✨', a: '武康路, 上海', b: '陆家嘴, 上海', mode: 'vibe' },
    { emoji: '📚', a: '人民广场, 上海', b: '徐家汇, 上海', mode: 'quiet' },
    { emoji: '⚡', a: '北京西站', b: '北京站', mode: 'fast' },
  ],
};
