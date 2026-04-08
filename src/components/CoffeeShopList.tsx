import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { getOpenInGoogleMapsUrl } from '../utils/googleMapsLinks';
import { CoffeeShopCard } from './CoffeeShopCard';
import styles from './CoffeeShopList.module.css';

export function CoffeeShopList() {
  const { locale, t } = useI18n();
  const {
    coffeeShops,
    isLoading,
    error,
    midpoint,
    selectedCoffeeShopId,
    setSelectedCoffeeShopId,
    addressA,
    addressB,
  } = useApp();

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

  const buildShareText = () => {
    const top = coffeeShops.slice(0, 3);
    const lines = top.map((shop, idx) => `${idx + 1}. ${shop.name} (${getOpenInGoogleMapsUrl(shop)})`);
    return [
      t('share.title'),
      `${t('share.from')}: ${addressA || '-'}`,
      `${t('share.to')}: ${addressB || '-'}`,
      '',
      ...lines,
      '',
      window.location.href,
    ].join('\n');
  };

  const handleShare = async () => {
    const text = buildShareText();
    try {
      if (navigator.share) {
        await navigator.share({ title: t('share.title'), text, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // Ignore cancellation and clipboard errors.
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <h3 className={styles.title}>{listTitle}</h3>
        <button type="button" className={styles.shareButton} onClick={handleShare}>
          {t('share.button')}
        </button>
      </div>
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
