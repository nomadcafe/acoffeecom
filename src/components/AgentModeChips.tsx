import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import type { AgentMode } from '../types';
import styles from './AgentModeChips.module.css';

const MODES: AgentMode[] = ['fair', 'fast', 'vibe', 'quiet', 'cheap', 'now'];

const ICONS: Record<AgentMode, string> = {
  fair: '🤝',
  fast: '⚡',
  vibe: '✨',
  quiet: '🌙',
  cheap: '💸',
  now: '🕐',
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
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`${styles.chip} ${selected ? styles.chipSelected : ''}`}
              onClick={() => setAgentMode(mode)}
              disabled={isLoading && !selected}
              title={t(`agentMode.${mode}.hint`)}
            >
              <span className={styles.chipIcon} aria-hidden>
                {ICONS[mode]}
              </span>
              <span className={styles.chipLabel}>{t(`agentMode.${mode}.label`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
