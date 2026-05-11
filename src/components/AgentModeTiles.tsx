import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { AGENT_MODES, AGENT_MODE_META } from '../utils/agentModeMeta';
import styles from './AgentModeTiles.module.css';

/**
 * Pre-search tile grid for the home hero. Sibling to AgentModeChips:
 * chips are the dense post-search sidebar surface, tiles are the
 * marketing-grade pre-search surface. Both consume the shared meta
 * in `utils/agentModeMeta.ts`.
 *
 * Tapping a tile sets `agentMode` so the next search the user runs
 * inherits the picked preset. Visited via the unified `setAgentMode`,
 * which already flips `agentModeIsAuto` to false — i.e. once the
 * user picks here, the chips strip in the result page won't render
 * the "auto-picked" caption (correct behaviour, not a bug).
 */
export function AgentModeTiles() {
  const { t } = useI18n();
  const { agentMode, agentModeIsAuto, setAgentMode } = useApp();

  return (
    <div
      className={styles.grid}
      role="radiogroup"
      aria-label={t('agentMode.aria')}
    >
      {AGENT_MODES.map((mode, i) => {
        const meta = AGENT_MODE_META[mode];
        const selected = mode === agentMode;
        const showAutoBadge = selected && agentModeIsAuto;
        /* Custom properties feed the stylesheet's color-mix() and
         * gradient expressions. Stagger delay turns the mount into a
         * cascading reveal — without it, five tiles popping in at
         * once feels static. */
        const tileStyle = {
          ['--tile-color' as string]: meta.color,
          ['--tile-gradient' as string]: meta.gradient,
          ['--tile-delay' as string]: `${i * 70}ms`,
        };
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`${styles.tile} ${selected ? styles.tileSelected : ''}`}
            style={tileStyle}
            onClick={() => setAgentMode(mode)}
          >
            <span className={styles.tileGlow} aria-hidden />
            <span className={styles.tileEmoji} aria-hidden>
              {meta.emoji}
            </span>
            <span className={styles.tileLabel}>
              {t(`agentMode.${mode}.label`)}
            </span>
            <span className={styles.tileHint}>
              {t(`agentMode.${mode}.hint`)}
            </span>
            {showAutoBadge ? (
              <span className={styles.tileAutoBadge} aria-hidden>
                ✦
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
