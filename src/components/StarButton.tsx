import { useApp } from '../context/AppContext';
import styles from './StarButton.module.css';

interface StarButtonProps {
  shopId: string;
}

export function StarButton({ shopId }: StarButtonProps) {
  const { toggleStar, isStarred } = useApp();
  const starred = isStarred(shopId);

  return (
    <button
      className={`${styles.starButton} ${starred ? styles.starred : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        toggleStar(shopId);
      }}
      aria-label={starred ? 'Remove from favorites' : 'Add to favorites'}
      title={starred ? 'Remove from favorites' : 'Add to favorites'}
    >
      {starred ? '★' : '☆'}
    </button>
  );
}
