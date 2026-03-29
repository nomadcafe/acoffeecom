import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { CoffeeShopCard } from './CoffeeShopCard';
import styles from './CoffeeShopList.module.css';

export function CoffeeShopList() {
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
          <p>Finding the best coffee spots...</p>
        </div>
      </div>
    );
  }

  if (!midpoint) {
    return (
      <div className={styles.container}>
        <div className={styles.placeholder}>
          <p>Enter two locations above to find coffee shops at your meetup point.</p>
        </div>
      </div>
    );
  }

  if (coffeeShops.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <p>No highly-rated coffee shops found nearby.</p>
          <p className={styles.hint}>Try locations that are closer together.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>
        {coffeeShops.length} Coffee Shop{coffeeShops.length !== 1 ? 's' : ''} Found
      </h3>
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
      <p className={styles.resultNote}>Places API (New) returns up to 20 cafes per search.</p>
    </div>
  );
}
