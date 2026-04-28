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
  const { agentMode, setAgentMode, isLoading, searchMode } = useApp();
  // Hide in nearby (single-party) mode — Fair / Fast / Now have no
  // meaning when there's only one origin to balance against. Vibe /
  // Quiet / Cheap kinda still apply but the row would be confusingly
  // half-relevant; better to hide entirely until the user enters two
  // addresses.
  if (searchMode === 'nearby') return null;
  return (
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
  );
}
