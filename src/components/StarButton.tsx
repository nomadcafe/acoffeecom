import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import styles from './StarButton.module.css';

interface StarButtonProps {
  shopId: string;
}

export function StarButton({ shopId }: StarButtonProps) {
  const { t } = useI18n();
  const { toggleStar, isStarred } = useApp();
  const starred = isStarred(shopId);

  return (
    <button
      className={`${styles.starButton} ${starred ? styles.starred : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        toggleStar(shopId);
      }}
      aria-label={starred ? t('star.remove') : t('star.add')}
      title={starred ? t('star.remove') : t('star.add')}
    >
      {starred ? '★' : '☆'}
    </button>
  );
}
