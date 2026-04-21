import type { CoffeeShop } from '../types';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import styles from './VisitedButton.module.css';

interface VisitedButtonProps {
  shop: CoffeeShop;
}

export function VisitedButton({ shop }: VisitedButtonProps) {
  const { t } = useI18n();
  const { toggleVisited, isVisited } = useApp();
  const visited = isVisited(shop.id);

  return (
    <button
      type="button"
      className={`${styles.visitedButton} ${visited ? styles.visited : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        toggleVisited(shop);
      }}
      aria-label={visited ? t('visited.remove') : t('visited.add')}
      aria-pressed={visited}
      title={visited ? t('visited.remove') : t('visited.add')}
    >
      <span aria-hidden="true">☕</span>
    </button>
  );
}
