import type { CoffeeShop } from '../types';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import styles from './VisitedButton.module.css';

interface VisitedButtonProps {
  shop: CoffeeShop;
}

export function VisitedButton({ shop }: VisitedButtonProps) {
  const { t } = useI18n();
  const { addVisit, visitCount } = useApp();
  const count = visitCount(shop.id);
  const stamped = count > 0;

  return (
    <button
      type="button"
      className={`${styles.visitedButton} ${stamped ? styles.stamped : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        addVisit(shop);
      }}
      aria-label={stamped ? t('visited.stampAgain', { count }) : t('visited.add')}
      title={stamped ? t('visited.stampAgain', { count }) : t('visited.add')}
    >
      <span className={styles.icon} aria-hidden="true">
        ☕
      </span>
      {count > 0 ? <span className={styles.count}>{count}</span> : null}
    </button>
  );
}
