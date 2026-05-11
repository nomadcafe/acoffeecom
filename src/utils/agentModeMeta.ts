import type { AgentMode } from '../types';

/* Single source of truth for agent-mode visual identity. The chips strip
 * (post-search sidebar) and the tile grid (pre-search hero) both consume
 * this — keeping the per-mode color/emoji/gradient in one place means a
 * palette tweak doesn't drift between the two surfaces. */

export const AGENT_MODES: readonly AgentMode[] = ['fair', 'fast', 'vibe', 'quiet', 'now'] as const;

export interface AgentModeMeta {
  /** One-glyph icon shown in chips and as the hero tile's display character. */
  emoji: string;
  /** Solid accent — used for chip selected fill, tile borders, focus ring. */
  color: string;
  /** Two-stop gradient — used for the tile selected fill so a tile reads
   *  as a vivid product surface vs the chip's flat pill. */
  gradient: string;
}

export const AGENT_MODE_META: Record<AgentMode, AgentModeMeta> = {
  fair: {
    emoji: '🤝',
    color: '#5e7a52',
    gradient: 'linear-gradient(135deg, #5e7a52 0%, #87a872 100%)',
  },
  fast: {
    emoji: '⚡',
    color: '#c97c2b',
    gradient: 'linear-gradient(135deg, #c97c2b 0%, #ecaa5c 100%)',
  },
  vibe: {
    emoji: '✨',
    color: '#b35a7a',
    gradient: 'linear-gradient(135deg, #b35a7a 0%, #d488ac 100%)',
  },
  quiet: {
    emoji: '🌙',
    color: '#4a5b8c',
    gradient: 'linear-gradient(135deg, #4a5b8c 0%, #7488ba 100%)',
  },
  now: {
    emoji: '🕐',
    color: '#c44a3a',
    gradient: 'linear-gradient(135deg, #c44a3a 0%, #e87862 100%)',
  },
};
