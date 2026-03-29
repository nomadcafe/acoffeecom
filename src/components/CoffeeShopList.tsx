import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { CoffeeShopCard } from './CoffeeShopCard';
import styles from './CoffeeShopList.module.css';

export function CoffeeShopList() {
  const { locale, t } = useI18n();
  const { coffeeShops, isLoading, error, midpoint, selectedCoffeeShopId, setSelectedCoffeeShopId } =
    useApp();

  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!selectedCoffeeShopId) return;
    const el = itemRefs.current.get(selectedCoffeeShopId);
    const id = requestAnimationFrame(() => {
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedCoffeeShopId]);

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>{t('list.loading')}</p>
        </div>
      </div>
    );
  }

  if (!midpoint) {
    return (
      <div className={styles.container}>
        <div className={styles.placeholder}>
          <p>{t('list.placeholder')}</p>
        </div>
      </div>
    );
  }

  if (coffeeShops.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <p>{t('list.empty')}</p>
          <p className={styles.hint}>{t('list.emptyHint')}</p>
        </div>
      </div>
    );
  }

  const n = coffeeShops.length;
  const listTitle =
    locale === 'ja'
      ? t('list.foundMany', { count: n })
      : n === 1
        ? t('list.foundOne', { count: n })
        : t('list.foundMany', { count: n });

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>{listTitle}</h3>
      <div className={styles.list}>
        {coffeeShops.map((shop) => (
          <div
            key={shop.id}
            ref={(el) => {
              if (el) itemRefs.current.set(shop.id, el);
              else itemRefs.current.delete(shop.id);
            }}
            className={`${styles.cardWrap} ${selectedCoffeeShopId === shop.id ? styles.cardWrapSelected : ''}`}
            onClick={() => setSelectedCoffeeShopId(shop.id)}
          >
            <CoffeeShopCard shop={shop} />
          </div>
        ))}
      </div>
      <p className={styles.resultNote}>{t('list.resultNote')}</p>
    </div>
  );
}
