import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import styles from './AppHeroSmartInput.module.css';

type ParseResponse = {
  mode: 'meetup' | 'nearby' | 'unknown';
  addressA?: string;
  addressB?: string;
  filters: {
    openNow?: boolean;
    minRating?: number;
    radiusKm?: number;
  };
  vibe?: string;
  confidence: 'high' | 'medium' | 'low';
};

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'applied'; vibe?: string }
  | { kind: 'lowConfidence'; vibe?: string }
  | { kind: 'nearbyHint' }
  | { kind: 'unknown' }
  | { kind: 'error' };

export function AppHeroSmartInput() {
  const { t, locale } = useI18n();
  const {
    setAddressA,
    setAddressB,
    setSearchOpenNow,
    setSearchMinRating,
    setSearchRadiusMeters,
  } = useApp();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const apply = useCallback(
    (parsed: ParseResponse) => {
      if (parsed.mode === 'nearby') {
        setStatus({ kind: 'nearbyHint' });
        return;
      }
      if (
        parsed.mode === 'unknown' ||
        (!parsed.addressA && !parsed.addressB) ||
        parsed.confidence === 'low'
      ) {
        setStatus({ kind: parsed.mode === 'unknown' ? 'unknown' : 'lowConfidence', vibe: parsed.vibe });
        // Still apply whatever we got so the user can correct inline.
        if (parsed.addressA) setAddressA(parsed.addressA);
        if (parsed.addressB) setAddressB(parsed.addressB);
        return;
      }

      if (parsed.addressA) setAddressA(parsed.addressA);
      if (parsed.addressB) setAddressB(parsed.addressB);
      if (parsed.filters.openNow != null) setSearchOpenNow(parsed.filters.openNow);
      if (parsed.filters.minRating != null) setSearchMinRating(parsed.filters.minRating);
      if (parsed.filters.radiusKm != null) {
        setSearchRadiusMeters(Math.round(parsed.filters.radiusKm * 1000));
      }
      setStatus({
        kind: parsed.confidence === 'medium' ? 'lowConfidence' : 'applied',
        vibe: parsed.vibe,
      });
    },
    [setAddressA, setAddressB, setSearchOpenNow, setSearchMinRating, setSearchRadiusMeters],
  );

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed || status.kind === 'busy') return;
      setStatus({ kind: 'busy' });
      try {
        const res = await fetch('/api/ai/parse-query', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: trimmed, locale }),
        });
        if (!res.ok) {
          setStatus({ kind: 'error' });
          return;
        }
        const parsed = (await res.json()) as ParseResponse;
        apply(parsed);
      } catch {
        setStatus({ kind: 'error' });
      }
    },
    [query, locale, status.kind, apply],
  );

  const busy = status.kind === 'busy';

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <label className={styles.label} htmlFor="heroSmartInput">
        {t('hero.smartLabel')}
      </label>
      <div className={styles.row}>
        <input
          id="heroSmartInput"
          type="text"
          className={styles.input}
          placeholder={t('hero.smartPlaceholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (status.kind !== 'idle' && status.kind !== 'busy') setStatus({ kind: 'idle' });
          }}
          disabled={busy}
          maxLength={500}
          autoComplete="off"
        />
        <button type="submit" className={styles.button} disabled={busy || !query.trim()}>
          {busy ? t('hero.smartBusy') : t('hero.smartSubmit')}
        </button>
      </div>
      <StatusLine t={t} status={status} />
    </form>
  );
}

function StatusLine({
  t,
  status,
}: {
  t: (key: string) => string;
  status: Status;
}) {
  if (status.kind === 'idle' || status.kind === 'busy') return null;

  const messageKey: Record<Exclude<Status['kind'], 'idle' | 'busy'>, string> = {
    applied: 'hero.smartApplied',
    lowConfidence: 'hero.smartLowConfidence',
    nearbyHint: 'hero.smartNearbyHint',
    unknown: 'hero.smartUnknown',
    error: 'hero.smartError',
  };
  const tone: Record<Exclude<Status['kind'], 'idle' | 'busy'>, string> = {
    applied: styles.statusOk,
    lowConfidence: styles.statusWarn,
    nearbyHint: styles.statusWarn,
    unknown: styles.statusWarn,
    error: styles.statusError,
  };

  const vibe = 'vibe' in status ? status.vibe : undefined;
  return (
    <p className={`${styles.status} ${tone[status.kind]}`}>
      {t(messageKey[status.kind])}
      {vibe ? <span className={styles.vibe}>{vibe}</span> : null}
    </p>
  );
}
