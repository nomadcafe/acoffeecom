import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { track } from '../utils/analytics';
import styles from './BookingWidget.module.css';

// Server requires the slot be ≥1h in the future (anti-stampede + lets
// the host see new bookings before they happen). Filter the same client-
// side so a stale tab doesn't surface clickable slots that always 400.
const MIN_LEAD_MINUTES = 60;
// Bare-minimum email shape — server is the real validator, but catching
// "still typing" / typos here saves a pointless POST and a generic
// error message in their face.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  // Form scroll target — when a slot is selected on a small phone the
  // form sits below the fold, and a tap looks like nothing happened.
  // Scroll the form into view so the visitor sees the next step.
  const formRef = useRef<HTMLFormElement | null>(null);

  // `chosenDayKey` is the user's explicit pick; when null we fall back to the
  // first available day so visitors see slots immediately. Tracking the
  // explicit pick separately avoids an effect-driven setState (and the
  // "cascading renders" lint that comes with it).
  const [chosenDayKey, setChosenDayKey] = useState<string | null>(null);
  const [selectedSlotMs, setSelectedSlotMs] = useState<number | null>(null);

  // When a slot is chosen, scroll the form into view. Most visible on
  // narrow viewports where the form lives below the slot grid; on
  // desktop the form is visible already and this no-ops if the form is
  // already in the viewport (smooth scroll is a no-op then).
  useEffect(() => {
    if (selectedSlotMs == null) return;
    const form = formRef.current;
    if (!form) return;
    // Wait one frame so the form has rendered before we measure.
    const id = requestAnimationFrame(() => {
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedSlotMs]);
  const [visitorName, setVisitorName] = useState('');
  const [visitorEmail, setVisitorEmail] = useState('');
  const [visitorAddress, setVisitorAddress] = useState('');
  const [visitorMessage, setVisitorMessage] = useState('');
  // Honeypot: hidden input bots fill but humans don't. Tracked in state so
  // we can include it in the payload — server rejects any non-empty value.
  const [website, setWebsite] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Abort + unmount guard: visitor can change `username` (parent
  // re-mounts), navigate, or background the tab during a slow availability
  // fetch. Without these, the late response calls setState on a stale
  // instance and clobbers fresh state.
  const loadAbortRef = useRef<AbortController | null>(null);
  const submitAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      loadAbortRef.current?.abort();
      submitAbortRef.current?.abort();
    };
  }, []);

  // Loader is reusable so the 409 handler below can refresh availability
  // when a slot gets snatched between the visitor's load and submit. Adds
  // a `bypassCache` cache-buster so the SW / CDN doesn't keep handing back
  // the stale slot list right after a booking just took it.
  const loadAvailability = useCallback(
    async (bypassCache = false) => {
      // Supersede any in-flight load — calling this from the 409 path
      // while the original mount fetch is still pending would otherwise
      // race the two responses.
      loadAbortRef.current?.abort();
      const ctrl = new AbortController();
      loadAbortRef.current = ctrl;
      const url =
        `/api/profile/${encodeURIComponent(username)}/availability` +
        (bypassCache ? `?_=${Date.now()}` : '');
      const r = await fetch(url, {
        cache: bypassCache ? 'no-store' : 'default',
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted || !mountedRef.current) return;
      if (r.status === 404) {
        setState({ kind: 'unavailable' });
        return;
      }
      if (!r.ok) {
        setState({ kind: 'error' });
        return;
      }
      const json = (await r.json()) as AvailabilityWire;
      if (ctrl.signal.aborted || !mountedRef.current) return;
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
    void (async () => {
      try {
        await loadAvailability();
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (mountedRef.current) setState({ kind: 'error' });
      }
    })();
  }, [loadAvailability]);

  // Group slots by viewer-local YYYY-MM-DD. Visitors think about their day
  // in their own TZ — "is there anything on Tuesday?" — not the host's.
  // Also filters out slots that are now within MIN_LEAD_MINUTES — server
  // would 400 those anyway and the message ("Slot must be at least 1 hour
  // in the future") doesn't tell the visitor it was a stale-page issue.
  const groupedByDay = useMemo(() => {
    const map = new Map<string, { dayKey: string; date: Date; slots: number[] }>();
    if (!data) return map;
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() + MIN_LEAD_MINUTES * 60_000;
    for (const ms of data.slots) {
      if (ms < cutoff) continue;
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
    // Double-submit guard: <button disabled> stops button-clicks but
    // pressing Enter inside an input still triggers form onSubmit, so
    // a fast typist can fire a second POST while the first is in flight.
    if (state.kind === 'submitting') return;
    if (!selectedSlotMs || !data) return;
    const trimmedEmail = visitorEmail.trim();
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setSubmitError(t('bookingWidget.emailInvalid'));
      return;
    }
    submitAbortRef.current?.abort();
    const ctrl = new AbortController();
    submitAbortRef.current = ctrl;
    setSubmitError(null);
    setState({ kind: 'submitting' });
    try {
      const r = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username,
          visitorName: visitorName.trim(),
          visitorEmail: trimmedEmail,
          visitorAddress: visitorAddress.trim(),
          message: visitorMessage.trim() || undefined,
          scheduledAt: selectedSlotMs,
          durationMinutes: data.durationMinutes,
          website,
        }),
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted || !mountedRef.current) return;
      const json = (await r.json().catch(() => ({}))) as Partial<BookingResponse> & {
        error?: string;
        code?: string;
        distanceKm?: number;
      };
      if (ctrl.signal.aborted || !mountedRef.current) return;
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
        // Server-coded errors get a localized message + advice. Only
        // codes the client recognizes are mapped; everything else falls
        // back to whatever string the server sent (still better than
        // the generic "submit failed").
        if (json.code === 'addresses_too_far') {
          setSubmitError(
            t('bookingWidget.errorTooFar', {
              km: json.distanceKm != null ? json.distanceKm : '',
            }),
          );
          setState({ kind: 'picking' });
          return;
        }
        if (json.code === 'no_cafes_nearby') {
          setSubmitError(t('bookingWidget.errorNoCafes'));
          setState({ kind: 'picking' });
          return;
        }
        setSubmitError(json.error ?? t('bookingWidget.submitFailed'));
        setState({ kind: 'picking' });
        return;
      }
      track('booking_submitted', { username });
      setState({ kind: 'submitted', result: json as BookingResponse });
    } catch (err) {
      if (ctrl.signal.aborted || !mountedRef.current) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setSubmitError(t('bookingWidget.submitFailed'));
      setState({ kind: 'picking' });
    }
  };

  // ---------- render ----------
  const handle = displayName?.trim() || `@${username}`;

  if (state.kind === 'loading') {
    // Skeleton matches the post-load shape — title + date-chip row +
    // a few slot pills — so the layout doesn't reflow when the real
    // data arrives. A bare loading sentence felt broken on slow
    // connections; this reads as "something is coming."
    return (
      <section className={styles.section} aria-busy="true">
        <h2 className={styles.title}>{t('bookingWidget.title')}</h2>
        <span className={styles.srOnly}>{t('bookingWidget.loading')}</span>
        <div className={styles.skeletonDateRow} aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={styles.skeletonDateChip} />
          ))}
        </div>
        <div className={styles.skeletonSlotGrid} aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={styles.skeletonSlotChip} />
          ))}
        </div>
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
        <button
          type="button"
          className={styles.errorRetry}
          onClick={() => {
            setState({ kind: 'loading' });
            void loadAvailability(true).catch(() => {
              if (mountedRef.current) setState({ kind: 'error' });
            });
          }}
        >
          {t('errors.retry')}
        </button>
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
          {/* Booking ID — small reference the visitor can quote at the
              host if the confirm email is blocked or never arrives. */}
          <p className={styles.successRef}>
            {t('bookingWidget.bookingRef', { id: r.booking.id.slice(0, 8) })}
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

      {submitError ? (
        <p
          id="booking-submit-error"
          className={styles.errorRow}
          role="alert"
        >
          {submitError}
        </p>
      ) : null}

      <p className={styles.dateLabel}>{t('bookingWidget.pickDate')}</p>
      <div
        className={styles.dateRow}
        role="radiogroup"
        aria-label={t('bookingWidget.pickDate')}
        onKeyDown={(e) => handleArrowNav(e, dayList.length, dayList.findIndex((d) => d.dayKey === selectedDayKey), (i) => {
          const next = dayList[i];
          if (!next) return;
          setChosenDayKey(next.dayKey);
          setSelectedSlotMs(null);
        })}
      >
        {dayList.map((day, idx) => {
          const isSelected = day.dayKey === selectedDayKey;
          // Show the month abbreviation when the chip starts a new
          // month (or is the first chip). Without this, "Mon 3" is
          // ambiguous when the visible range straddles month boundaries.
          const prev = idx > 0 ? dayList[idx - 1].date : null;
          const showMonth =
            prev == null ||
            prev.getMonth() !== day.date.getMonth() ||
            prev.getFullYear() !== day.date.getFullYear();
          return (
            <button
              key={day.dayKey}
              type="button"
              className={`${styles.dateChip} ${isSelected ? styles.dateChipSelected : ''}`}
              onClick={() => {
                setChosenDayKey(day.dayKey);
                setSelectedSlotMs(null);
              }}
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              disabled={submitting}
              aria-label={formatDayAria(day.date, locale)}
            >
              <span className={styles.dateChipWeekday}>{formatWeekday(day.date, locale)}</span>
              <span className={styles.dateChipDay}>{day.date.getDate()}</span>
              {showMonth ? (
                <span className={styles.dateChipMonth}>
                  {formatMonthShort(day.date, locale)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedDayKey ? (
        <>
          <p className={styles.slotLabel}>{t('bookingWidget.pickSlot')}</p>
          <div
            className={styles.slotGrid}
            role="radiogroup"
            aria-label={t('bookingWidget.pickSlot')}
            onKeyDown={(e) => handleArrowNav(e, slotsForDay.length, slotsForDay.findIndex((ms) => ms === selectedSlotMs), (i) => {
              const ms = slotsForDay[i];
              if (ms != null) setSelectedSlotMs(ms);
            })}
          >
            {slotsForDay.map((ms) => {
              const isSelected = ms === selectedSlotMs;
              return (
                <button
                  key={ms}
                  type="button"
                  className={`${styles.slotChip} ${isSelected ? styles.slotChipSelected : ''}`}
                  onClick={() => setSelectedSlotMs(ms)}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected || (selectedSlotMs == null && ms === slotsForDay[0]) ? 0 : -1}
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
        <form ref={formRef} className={styles.formCard} onSubmit={handleSubmit}>
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
              inputMode="email"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
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
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              {t('bookingWidget.fieldMessage')}{' '}
              <span className={styles.fieldOptional}>{t('bookingWidget.fieldOptional')}</span>
            </span>
            <textarea
              className={styles.textarea}
              maxLength={500}
              rows={3}
              placeholder={t('bookingWidget.messagePlaceholder')}
              value={visitorMessage}
              onChange={(e) => setVisitorMessage(e.target.value)}
              disabled={submitting}
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
              aria-describedby={submitError ? 'booking-submit-error' : undefined}
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

/**
 * WAI-ARIA radiogroup keyboard pattern: ←/↑ → previous, →/↓ → next,
 * Home → first, End → last, with wraparound. The pickers (date row
 * and slot grid) use this so a keyboard user can move through choices
 * without Tab having to pass through every option (radiogroup expects
 * a single tab stop per group, then arrow nav within).
 */
function handleArrowNav(
  e: React.KeyboardEvent<HTMLDivElement>,
  count: number,
  current: number,
  pick: (i: number) => void,
): void {
  if (count === 0) return;
  let next = current;
  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      next = current <= 0 ? count - 1 : current - 1;
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      next = current < 0 || current >= count - 1 ? 0 : current + 1;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = count - 1;
      break;
    default:
      return;
  }
  e.preventDefault();
  pick(next);
  // Move focus to the now-checked radio so screen readers announce
  // it. The button has tabIndex=0 only when checked, so querying for
  // [tabindex="0"] after the next render finds it.
  requestAnimationFrame(() => {
    const target = e.currentTarget?.querySelector<HTMLButtonElement>(
      'button[tabindex="0"]',
    );
    target?.focus();
  });
}

function formatWeekday(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d);
}

function formatMonthShort(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(d);
}

function formatDayAria(d: Date, locale: string): string {
  // Full date for screen-reader announcement — sighted users see only
  // weekday + day number + (optional) month abbrev, but SR users get
  // the unambiguous string.
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(d);
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
