import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { track } from '../utils/analytics';
import styles from './BookingWidget.module.css';

interface Props {
  username: string;
  /** Display name fallback "@username" — used for the success message. */
  displayName: string | null;
}

interface AvailabilityWire {
  durationMinutes: number;
  timezone: string;
  /** UTC ms timestamps. */
  slots: number[];
}

interface BookingResponse {
  booking: {
    id: string;
    scheduledAt: number;
    durationMinutes: number;
    status?: 'unconfirmed' | 'pending';
  };
  cafe: {
    placeId: string;
    name: string;
    address: string;
    googleMapsUri?: string | null;
  };
  pendingEmailConfirmation?: boolean;
}

type FlowState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'error' }
  | { kind: 'picking' }
  | { kind: 'submitting' }
  | { kind: 'submitted'; result: BookingResponse };

/**
 * Visitor-facing booking widget for `acoffee.com/<username>`. Walks the
 * visitor through three steps in-place: pick a date, pick a slot in that
 * day, fill in their name/email/address. On submit the server geocodes
 * both endpoints, picks a midpoint café, persists the booking, and emails
 * both sides — we just confirm "you're booked at <café>".
 *
 * All times are rendered in the visitor's local timezone (Intl), so a
 * Tokyo organizer's "14:00–17:00" surfaces in NY as "1am–4am Wed" — that's
 * the actual wall-clock the visitor needs to plan around. The host's
 * timezone is shown as a small note so a visitor who's surprised about
 * the hours has context.
 */
export function BookingWidget({ username, displayName }: Props) {
  const { t, locale } = useI18n();

  const [data, setData] = useState<AvailabilityWire | null>(null);
  const [state, setState] = useState<FlowState>({ kind: 'loading' });

  // `chosenDayKey` is the user's explicit pick; when null we fall back to the
  // first available day so visitors see slots immediately. Tracking the
  // explicit pick separately avoids an effect-driven setState (and the
  // "cascading renders" lint that comes with it).
  const [chosenDayKey, setChosenDayKey] = useState<string | null>(null);
  const [selectedSlotMs, setSelectedSlotMs] = useState<number | null>(null);
  const [visitorName, setVisitorName] = useState('');
  const [visitorEmail, setVisitorEmail] = useState('');
  const [visitorAddress, setVisitorAddress] = useState('');
  // Honeypot: hidden input bots fill but humans don't. Tracked in state so
  // we can include it in the payload — server rejects any non-empty value.
  const [website, setWebsite] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Loader is reusable so the 409 handler below can refresh availability
  // when a slot gets snatched between the visitor's load and submit. Adds
  // a `bypassCache` cache-buster so the SW / CDN doesn't keep handing back
  // the stale slot list right after a booking just took it.
  const loadAvailability = useCallback(
    async (bypassCache = false) => {
      const url =
        `/api/profile/${encodeURIComponent(username)}/availability` +
        (bypassCache ? `?_=${Date.now()}` : '');
      const r = await fetch(url, { cache: bypassCache ? 'no-store' : 'default' });
      if (r.status === 404) {
        setState({ kind: 'unavailable' });
        return;
      }
      if (!r.ok) {
        setState({ kind: 'error' });
        return;
      }
      const json = (await r.json()) as AvailabilityWire;
      setData(json);
      if (json.slots.length === 0) {
        setState({ kind: 'unavailable' });
        return;
      }
      setState({ kind: 'picking' });
    },
    [username],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadAvailability();
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAvailability]);

  // Group slots by viewer-local YYYY-MM-DD. Visitors think about their day
  // in their own TZ — "is there anything on Tuesday?" — not the host's.
  const groupedByDay = useMemo(() => {
    const map = new Map<string, { dayKey: string; date: Date; slots: number[] }>();
    if (!data) return map;
    for (const ms of data.slots) {
      const d = new Date(ms);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const existing = map.get(key);
      if (existing) {
        existing.slots.push(ms);
      } else {
        map.set(key, { dayKey: key, date: d, slots: [ms] });
      }
    }
    return map;
  }, [data]);

  const dayList = useMemo(
    () => Array.from(groupedByDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime()),
    [groupedByDay],
  );

  // Effective selection: user's explicit pick if it still exists, else the
  // first available day. Means slots show up immediately when availability
  // loads, without needing an effect to set state.
  const selectedDayKey =
    chosenDayKey && groupedByDay.has(chosenDayKey)
      ? chosenDayKey
      : dayList[0]?.dayKey ?? null;

  const slotsForDay = useMemo(() => {
    if (!selectedDayKey) return [];
    return groupedByDay.get(selectedDayKey)?.slots ?? [];
  }, [groupedByDay, selectedDayKey]);

  // ---------- handlers ----------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlotMs || !data) return;
    setSubmitError(null);
    setState({ kind: 'submitting' });
    try {
      const r = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username,
          visitorName: visitorName.trim(),
          visitorEmail: visitorEmail.trim(),
          visitorAddress: visitorAddress.trim(),
          scheduledAt: selectedSlotMs,
          durationMinutes: data.durationMinutes,
          website,
        }),
      });
      const json = (await r.json().catch(() => ({}))) as Partial<BookingResponse> & {
        error?: string;
      };
      if (!r.ok || !json.booking || !json.cafe) {
        // 409 means another visitor grabbed the slot in the gap between this
        // visitor seeing it and pressing submit. Refresh availability so the
        // taken slot disappears, drop the now-invalid selection, and surface
        // a clearer message than the generic "submit failed".
        if (r.status === 409) {
          setSelectedSlotMs(null);
          setSubmitError(t('bookingWidget.slotTaken'));
          setState({ kind: 'picking' });
          try {
            await loadAvailability(true);
          } catch {
            // Refresh failure is fine — the user still sees the error and
            // the existing (slightly stale) list to retry from.
          }
          return;
        }
        setSubmitError(json.error ?? t('bookingWidget.submitFailed'));
        setState({ kind: 'picking' });
        return;
      }
      track('booking_submitted', { username });
      setState({ kind: 'submitted', result: json as BookingResponse });
    } catch {
      setSubmitError(t('bookingWidget.submitFailed'));
      setState({ kind: 'picking' });
    }
  };

  // ---------- render ----------
  const handle = displayName?.trim() || `@${username}`;

  if (state.kind === 'loading') {
    return (
      <section className={styles.section} aria-busy="true">
        <h2 className={styles.title}>{t('bookingWidget.title')}</h2>
        <p className={styles.placeholder}>{t('bookingWidget.loading')}</p>
      </section>
    );
  }

  if (state.kind === 'unavailable') {
    return (
      <section className={styles.section}>
        <h2 className={styles.title}>{t('bookingWidget.title')}</h2>
        <p className={styles.placeholder}>{t('bookingWidget.notSetUp')}</p>
      </section>
    );
  }

  if (state.kind === 'error') {
    return (
      <section className={styles.section}>
        <h2 className={styles.title}>{t('bookingWidget.title')}</h2>
        <p className={styles.placeholder}>{t('bookingWidget.loadFailed')}</p>
      </section>
    );
  }

  if (state.kind === 'submitted') {
    const r = state.result;
    const startStr = formatDateTime(new Date(r.booking.scheduledAt), locale);
    const mapsHref = r.cafe.googleMapsUri
      ? r.cafe.googleMapsUri
      : `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(r.cafe.placeId)}`;
    // Until the visitor clicks the email confirm link, the booking is
    // unconfirmed and the host hasn't been told. The success state
    // should reflect this — show the auto-picked café (the moat) but
    // nudge the visitor to check their email instead of saying
    // "you're on the calendar".
    const pendingConfirm = r.pendingEmailConfirmation || r.booking.status === 'unconfirmed';
    return (
      <section className={styles.section}>
        <div className={styles.success}>
          <div className={styles.successEmoji} aria-hidden>☕</div>
          <h2 className={styles.successTitle}>
            {pendingConfirm
              ? t('bookingWidget.checkEmailTitle')
              : t('bookingWidget.successTitle')}
          </h2>
          <p className={styles.successBody}>
            {pendingConfirm
              ? t('bookingWidget.checkEmailBody', { handle, when: startStr, email: visitorEmail })
              : t('bookingWidget.successBody', { handle, when: startStr })}
          </p>
          <div className={styles.successCafe}>
            <p className={styles.successCafeName}>{r.cafe.name}</p>
            <p className={styles.successCafeAddress}>{r.cafe.address}</p>
            <a
              className={styles.successMapsLink}
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
            >
              {t('bookingWidget.openInMaps')} →
            </a>
          </div>
          <p className={styles.successBody}>
            {pendingConfirm
              ? t('bookingWidget.checkEmailFollowUp')
              : t('bookingWidget.successFollowUp')}
          </p>
        </div>
      </section>
    );
  }

  // state.kind === 'picking' or 'submitting'
  const submitting = state.kind === 'submitting';

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>{t('bookingWidget.title')}</h2>
      <p className={styles.lead}>{t('bookingWidget.lead', { handle })}</p>

      {submitError ? <p className={styles.errorRow}>{submitError}</p> : null}

      <p className={styles.dateLabel}>{t('bookingWidget.pickDate')}</p>
      <div className={styles.dateRow} role="listbox" aria-label={t('bookingWidget.pickDate')}>
        {dayList.map((day) => {
          const isSelected = day.dayKey === selectedDayKey;
          return (
            <button
              key={day.dayKey}
              type="button"
              className={`${styles.dateChip} ${isSelected ? styles.dateChipSelected : ''}`}
              onClick={() => {
                setChosenDayKey(day.dayKey);
                setSelectedSlotMs(null);
              }}
              role="option"
              aria-selected={isSelected}
              disabled={submitting}
            >
              <span className={styles.dateChipWeekday}>{formatWeekday(day.date, locale)}</span>
              <span className={styles.dateChipDay}>{day.date.getDate()}</span>
            </button>
          );
        })}
      </div>

      {selectedDayKey ? (
        <>
          <p className={styles.slotLabel}>{t('bookingWidget.pickSlot')}</p>
          <div className={styles.slotGrid} role="listbox" aria-label={t('bookingWidget.pickSlot')}>
            {slotsForDay.map((ms) => {
              const isSelected = ms === selectedSlotMs;
              return (
                <button
                  key={ms}
                  type="button"
                  className={`${styles.slotChip} ${isSelected ? styles.slotChipSelected : ''}`}
                  onClick={() => setSelectedSlotMs(ms)}
                  role="option"
                  aria-selected={isSelected}
                  disabled={submitting}
                >
                  {formatTime(new Date(ms), locale)}
                </button>
              );
            })}
          </div>
          {data ? (
            <p className={styles.tzNote}>
              {t('bookingWidget.tzNote', { timezone: data.timezone })}
            </p>
          ) : null}
        </>
      ) : null}

      {selectedSlotMs ? (
        <form className={styles.formCard} onSubmit={handleSubmit}>
          <p className={styles.formChosen}>
            {t('bookingWidget.chosen', {
              when: formatDateTime(new Date(selectedSlotMs), locale),
            })}
          </p>
          {/* Honeypot — hidden offscreen, ignored by humans, filled by bots. */}
          <div className={styles.honeypot} aria-hidden="true">
            <label>
              Website
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('bookingWidget.fieldName')}</span>
            <input
              className={styles.input}
              type="text"
              required
              maxLength={80}
              value={visitorName}
              onChange={(e) => setVisitorName(e.target.value)}
              disabled={submitting}
              autoComplete="name"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('bookingWidget.fieldEmail')}</span>
            <input
              className={styles.input}
              type="email"
              required
              maxLength={120}
              value={visitorEmail}
              onChange={(e) => setVisitorEmail(e.target.value)}
              disabled={submitting}
              autoComplete="email"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('bookingWidget.fieldAddress')}</span>
            <input
              className={styles.input}
              type="text"
              required
              maxLength={200}
              placeholder={t('bookingWidget.addressPlaceholder')}
              value={visitorAddress}
              onChange={(e) => setVisitorAddress(e.target.value)}
              disabled={submitting}
              autoComplete="street-address"
            />
          </label>
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.back}
              onClick={() => setSelectedSlotMs(null)}
              disabled={submitting}
            >
              {t('bookingWidget.back')}
            </button>
            <button
              type="submit"
              className={styles.submit}
              disabled={submitting || !visitorName.trim() || !visitorEmail.trim() || !visitorAddress.trim()}
            >
              {submitting ? t('bookingWidget.submitting') : t('bookingWidget.submit')}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatWeekday(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d);
}

function formatTime(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d);
}

function formatDateTime(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}
