import type { FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import styles from './LocationInput.module.css';

export function LocationInput() {
  const { addressA, addressB, setAddressA, setAddressB, findMeetupSpot, isLoading } = useApp();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    findMeetupSpot();
  };

  return (
    <form className={styles.container} onSubmit={handleSubmit}>
      <h2 className={styles.title}>Find Your Coffee Meetup Spot</h2>
      <p className={styles.subtitle}>
        Enter both addresses, then tap <strong>Find Meetup Spot</strong> — that runs the search.
      </p>

      <div className={styles.inputGroup}>
        <label htmlFor="locationA" className={styles.label}>
          <span className={styles.marker} style={{ backgroundColor: '#4285f4' }}>A</span>
          Your Location
        </label>
        <input
          id="locationA"
          type="text"
          className={styles.input}
          placeholder="e.g., Times Square, NYC"
          value={addressA}
          onChange={(e) => setAddressA(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className={styles.inputGroup}>
        <label htmlFor="locationB" className={styles.label}>
          <span className={styles.marker} style={{ backgroundColor: '#34a853' }}>B</span>
          Friend's Location
        </label>
        <input
          id="locationB"
          type="text"
          className={styles.input}
          placeholder="e.g., Brooklyn Bridge, NYC"
          value={addressB}
          onChange={(e) => setAddressB(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <button type="submit" className={styles.button} disabled={isLoading}>
        {isLoading ? 'Searching...' : 'Find Meetup Spot'}
      </button>
    </form>
  );
}
