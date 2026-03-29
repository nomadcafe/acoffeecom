import type { CoffeeShop } from '../types';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import styles from './StarButton.module.css';

interface StarButtonProps {
  shop: CoffeeShop;
}

export function StarButton({ shop }: StarButtonProps) {
  const { t } = useI18n();
  const { toggleStar, isStarred } = useApp();
  const starred = isStarred(shop.id);

  return (
    <button
      className={`${styles.starButton} ${starred ? styles.starred : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        toggleStar(shop);
      }}
      aria-label={starred ? t('star.remove') : t('star.add')}
      title={starred ? t('star.remove') : t('star.add')}
    >
      {starred ? '★' : '☆'}
    </button>
  );
}
