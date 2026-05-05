import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import type { AgentMode } from '../types';
import styles from './AgentModeChips.module.css';

const MODES: AgentMode[] = ['fair', 'fast', 'vibe', 'quiet', 'cheap', 'now'];

/* Per-mode visual identity. The previous version had emoji + label
 * but every chip looked identical (sage-on-cream); the strip read as
 * "filter buttons" rather than "agent personalities." Each mode now
 * carries its own warm-palette accent that tints the idle gradient
 * and fully fills the selected state. Colors picked to sit in similar
 * luminance so they read as a family, not a rainbow. */
const MODE_META: Record<AgentMode, { color: string; emoji: string }> = {
  fair: { color: '#5e7a52', emoji: '🤝' }, // sage
  fast: { color: '#c97c2b', emoji: '⚡' }, // amber
  vibe: { color: '#b35a7a', emoji: '✨' }, // rose
  quiet: { color: '#4a5b8c', emoji: '🌙' }, // slate
  cheap: { color: '#b08c2c', emoji: '💸' }, // gold
  now: { color: '#c44a3a', emoji: '🕐' }, // coral
};

/**
 * Six-chip preset row that's the new top-level decision UI: instead of
 * fiddling with sort + filter dropdowns, the user taps one mode and
 * the agent applies a sensible bundle. Available in both the
 * pre-search hero and the sidebar post-search, sharing one piece of
 * AppContext state.
 *
 * Each chip carries a small i18n label + a coloured emoji glyph so the
 * row stays scannable when widened to a tablet.
 */
export function AgentModeChips() {
  const { t } = useI18n();
  const { agentMode, agentModeIsAuto, setAgentMode, isLoading, searchMode, midpoint } = useApp();
  // Hide in nearby (single-party) mode — Fair / Fast / Now have no
  // meaning when there's only one origin to balance against.
  if (searchMode === 'nearby') return null;
  // Hide pre-search too. Showing six "decision" chips before the user
  // has entered any addresses is confusing — there's nothing yet for
  // the agent to decide between. Once a midpoint exists (search ran),
  // the chips reveal so the user can re-pick a mode and re-rank
  // results in place.
  if (!midpoint && !isLoading) return null;
  return (
    <div className={styles.wrap}>
      {/* "Auto-picked" caption — visible only when the agent set the
          mode (vs the user tapping a chip). Delivers the "AI agent
          decides" pitch without taking control away: any chip click
          flips this off. Once the user manually picks once, the
          caption goes away and stays away until next session. */}
      {agentModeIsAuto ? (
        <p className={styles.autoCaption} aria-live="polite">
          <span className={styles.autoBadge} aria-hidden>✨</span>
          {t('agentMode.autoCaption', { mode: t(`agentMode.${agentMode}.label`) })}
        </p>
      ) : null}
      <div className={styles.row} role="radiogroup" aria-label={t('agentMode.aria')}>
        {MODES.map((mode) => {
          const selected = mode === agentMode;
          const meta = MODE_META[mode];
          /* CSS custom property carries the per-mode color into the
           * stylesheet's color-mix() expressions. Each chip's idle
           * background / hover border / selected fill / focus ring
           * all derive from this one value — keeps the visual
           * personality consistent without listing every state in
           * inline styles. */
          const chipStyle = { ['--chip-color' as string]: meta.color };
          /* Sparkle corner badge when the agent picked this mode itself
           * (vs the user clicking it). Pairs with the existing
           * autoCaption above so the "AI decided" signal is visible
           * both at the strip level and per-chip. */
          const showAutoBadge = selected && agentModeIsAuto;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`${styles.chip} ${selected ? styles.chipSelected : ''}`}
              style={chipStyle}
              onClick={() => setAgentMode(mode)}
              disabled={isLoading && !selected}
              title={t(`agentMode.${mode}.hint`)}
            >
              <span className={styles.chipIcon} aria-hidden>
                {meta.emoji}
              </span>
              <span className={styles.chipLabel}>{t(`agentMode.${mode}.label`)}</span>
              {showAutoBadge ? (
                <span className={styles.chipAutoBadge} aria-hidden>✦</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
