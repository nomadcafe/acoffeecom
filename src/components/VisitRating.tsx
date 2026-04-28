import styles from './VisitRating.module.css';

interface Props {
  /** 0 means no rating; 1–5 sets the rating. */
  value: number;
  /** Called with 1–5 to set, or 0 to clear (re-tapping the current value). */
  onChange: (next: number) => void;
  /** Read-only mode for display contexts (cards, public profiles later). */
  readOnly?: boolean;
  /** ARIA label override for context — e.g. "Rate your visit on March 12". */
  ariaLabel?: string;
}

/**
 * 5-star rating row used inside the visit detail surfaces. Tapping the
 * current value clears it (matches Apple Music / Letterboxd behavior —
 * the same star is the toggle-off). Stays a flat row of buttons rather
 * than a slider so taps on mobile go straight to the desired rating.
 */
export function VisitRating({ value, onChange, readOnly, ariaLabel }: Props) {
  const v = Math.max(0, Math.min(5, Math.round(value || 0)));
  return (
    <div
      className={styles.row}
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={ariaLabel ?? `Rating: ${v} of 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= v;
        if (readOnly) {
          return (
            <span
              key={n}
              className={`${styles.star} ${filled ? styles.starFilled : ''}`}
              aria-hidden
            >
              {filled ? '★' : '☆'}
            </span>
          );
        }
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === v}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            className={`${styles.star} ${filled ? styles.starFilled : ''}`}
            onClick={() => onChange(n === v ? 0 : n)}
          >
            {filled ? '★' : '☆'}
          </button>
        );
      })}
    </div>
  );
}
