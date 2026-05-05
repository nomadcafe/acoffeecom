import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';

/* AuthModal is split off the main bundle. The signed-out branch loads
 * it on-demand when the host clicks "Sign in" — no penalty for the
 * common path where the user is already signed in. */
const AuthModal = lazy(() => import('./AuthModal').then((m) => ({ default: m.AuthModal })));
import { useSession } from '../utils/authClient';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { BOOKINGS_PATH } from '../routes';
import { useCafeAutocomplete, type PickedCafe } from '../hooks/useCafeAutocomplete';
import { AccountMenu } from './AccountMenu';
import { HeaderNavLinks } from './HeaderNavLinks';
import { SkipToContent } from './SkipToContent';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SyncIndicator } from './SyncIndicator';
import accountStyles from './AccountPage.module.css';
import styles from './BookingsPage.module.css';

/** localStorage keys for the user's TZ + view-mode preferences so the
 *  toggles aren't re-applied every time they navigate back. Hardcoded
 *  here rather than threaded — they're never read from anywhere else. */
const BOOKINGS_TZ_MODE_KEY = 'ACoffee-bookings-tz-mode';
const BOOKINGS_VIEW_MODE_KEY = 'ACoffee-bookings-view-mode';

interface BookingWire {
  id: string;
  visitorName: string;
  visitorEmail: string;
  visitorAddress: string | null;
  scheduledAt: number;
  durationMinutes: number;
  // place_* are null for `requested` rows (host hasn't picked yet).
  placeId: string | null;
  placeName: string | null;
  placeAddress: string | null;
  placeLat: number | null;
  placeLng: number | null;
  approvedAt: number | null;
  // 'confirmed' is reserved for the future double-opt-in flow where
  // visitor confirms via email — server may emit it once that ships.
  // UI handles it in the same upcoming bucket as 'pending' until an
  // explicit visual differentiation is decided.
  // 'requested' = visitor's request awaiting host approval (no place_*).
  // 'pending'   = approved (or legacy double-opt-in confirmed). Has place_*.
  // 'rejected'  = host declined; informational only.
  // 'cancelled' = either side cancelled an approved booking.
  // 'confirmed' is reserved for a future double-opt-in flow on top of
  // 'requested'; UI treats it the same as 'pending' for now.
  status: 'requested' | 'pending' | 'confirmed' | 'rejected' | 'cancelled';
  visitorMessage: string | null;
  createdAt: number;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; bookings: BookingWire[] }
  | { kind: 'error' };

/** Subset of FeaturedCafeDraft that the approve modal needs as a
 *  quick-pick. Matches the place-only shape the approve POST expects;
 *  we drop relation/notes/links since none of that is needed to lock
 *  in a booking venue. */
interface FeaturedCafeQuickPick {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Google Maps deep link, when the host saved one with the cafe.
   *  Threaded through to the approve payload so the visitor's email
   *  gets an "Open in Maps" CTA. */
  googleMapsUri: string | null;
}

/**
 * Organizer-facing list of bookings made on /yourname. Visitors don't see
 * this page — only the host. Upcoming bookings sit at the top with a cancel
 * button; past + cancelled fold under a separate header so the active list
 * stays focused.
 */
export function BookingsPage() {
  const { t, locale } = useI18n();
  const { data: session, isPending } = useSession();
  const homeHref = buildLocalizedPathname('/', locale);

  const sessionUser = session?.user as
    | { email?: string; timezone?: string | null }
    | undefined;
  const signedIn = !!sessionUser?.email;

  // Two timezones the organizer might want to read times in: their home
  // base (saved when they configured availability — also the zone the
  // visitor sees in their confirmation email) and wherever they currently
  // are. Default to home so it matches what the visitor sees; let them
  // flip to local while travelling.
  const homeTz = sessionUser?.timezone || 'UTC';
  const localTz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  })();
  const tzMatches = homeTz === localTz;
  // tzMode + viewMode persist in localStorage so toggling once doesn't
  // get re-toggled on every navigation back. Bare reads (no try/catch)
  // are fine — localStorage absence falls into the typeof check.
  const [tzMode, setTzMode] = useState<'home' | 'local'>(() => {
    if (typeof localStorage === 'undefined') return 'home';
    return localStorage.getItem(BOOKINGS_TZ_MODE_KEY) === 'local' ? 'local' : 'home';
  });
  useEffect(() => {
    try {
      localStorage.setItem(BOOKINGS_TZ_MODE_KEY, tzMode);
    } catch {
      /* ignore quota / privacy mode */
    }
  }, [tzMode]);
  const effectiveTz = tzMode === 'home' ? homeTz : localTz;

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // The action modal handles both "cancel" and "reschedule" — same flow,
  // just different wording and a different `?intent=` query param sent
  // to the backend. Reschedule = cancel + auto-email visitor a "pick
  // a new time" link to /yourname.
  type Intent = 'cancel' | 'reschedule';
  const [actionTarget, setActionTarget] = useState<{ row: BookingWire; intent: Intent } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // Approve/reject the visitor's request — separate flow from the
  // existing cancel/reschedule modal because it operates on a different
  // status ('requested') and the approve path needs a café picker.
  type RequestIntent = 'approve' | 'reject';
  const [requestTarget, setRequestTarget] = useState<
    { row: BookingWire; intent: RequestIntent } | null
  >(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  // Host's featured cafés — surfaced as quick-pick buttons in the
  // approve modal so the host doesn't have to re-search Places for
  // their usual coffee spot. Lazy-fetched on first modal open and
  // cached for the rest of the session.
  const [featuredCafes, setFeaturedCafes] = useState<FeaturedCafeQuickPick[] | null>(null);
  // List = the original chronological row layout. Week = a 7-column grid
  // of the currently-anchored week. Persisted so the user's preferred
  // view sticks across navigations / reloads.
  const [viewMode, setViewMode] = useState<'list' | 'week'>(() => {
    if (typeof localStorage === 'undefined') return 'list';
    return localStorage.getItem(BOOKINGS_VIEW_MODE_KEY) === 'week' ? 'week' : 'list';
  });
  useEffect(() => {
    try {
      localStorage.setItem(BOOKINGS_VIEW_MODE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);
  const [weekAnchorMs, setWeekAnchorMs] = useState<number>(() => Date.now());

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setState({ kind: 'loading' });
    try {
      const r = await fetch('/api/bookings', {
        credentials: 'include',
        signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as { bookings: BookingWire[] };
      if (signal?.aborted) return;
      setState({ kind: 'ready', bookings: json.bookings });
    } catch (e) {
      // AbortError from a superseding refresh is not an error worth
      // surfacing — the new request will repaint state in a moment.
      if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
        return;
      }
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    // Mount fetch is owned by an AbortController so navigating away
    // mid-flight (or signing out) doesn't resolve into a stale state
    // setter on a dead component.
    const ctrl = new AbortController();
    void refresh(ctrl.signal);
    return () => ctrl.abort();
  }, [signedIn, refresh]);

  // ----- Loading skeleton (auth + initial fetch share this) -----
  if (isPending) {
    return (
      <div className={accountStyles.app}>
        <SkipToContent />
        <PageHeader homeHref={homeHref} />
        <main id="content" tabIndex={-1} className={accountStyles.main} aria-busy="true">
          <div className={accountStyles.hero}>
            <div className={`${accountStyles.skeletonRow} ${accountStyles.skeletonRowMed}`} />
          </div>
          {[0, 1].map((i) => (
            <section key={i} className={accountStyles.card}>
              <div className={`${accountStyles.skeletonRow} ${accountStyles.skeletonRowShort}`} />
              <div className={accountStyles.skeletonRow} style={{ marginTop: '0.6rem' }} />
            </section>
          ))}
        </main>
      </div>
    );
  }

  // ----- Signed out -----
  if (!signedIn) {
    return (
      <BookingsSignedOut
        homeHref={homeHref}
        callbackURL={buildLocalizedPathname(BOOKINGS_PATH, locale)}
      />
    );
  }

  // ----- Signed in: render list -----
  const confirmAction = async () => {
    if (!actionTarget) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const url =
        `/api/bookings/${encodeURIComponent(actionTarget.row.id)}` +
        (actionTarget.intent === 'reschedule' ? '?intent=reschedule' : '');
      const r = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setActionTarget(null);
      await refresh();
    } catch {
      setCancelError(t('bookings.cancelFailed'));
    } finally {
      setCancelling(false);
    }
  };

  /**
   * POST /api/bookings/:id/approve with the host's café choice and
   * (optional) a new scheduledAt. On success: status flips → 'pending',
   * visitor gets a "X said yes, meet at Y at <time>" email, and the
   * list refreshes so the row moves out of Pending and into Upcoming.
   */
  const approveRequest = async (payload: {
    placeId: string;
    placeName: string;
    placeAddress: string;
    placeLat: number;
    placeLng: number;
    /** Google Maps deep link from the cafe pick. Server validates the
     *  scheme + host against an allowlist (https + Google Maps host).
     *  When present, lands as the "Open in Maps" CTA in the visitor's
     *  confirmation email. */
    googleMapsUri?: string | null;
    /** Only sent when host actually changed the time in the modal. */
    scheduledAt?: number;
  }) => {
    if (!requestTarget) return;
    setRequestBusy(true);
    setRequestError(null);
    try {
      const r = await fetch(
        `/api/bookings/${encodeURIComponent(requestTarget.row.id)}/approve`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      setRequestTarget(null);
      await refresh();
    } catch (e) {
      setRequestError(
        e instanceof Error && e.message ? e.message : t('bookings.approveFailed'),
      );
    } finally {
      setRequestBusy(false);
    }
  };

  /** POST /api/bookings/:id/reject — politely declines the request. */
  const rejectRequest = async (reason: string | undefined) => {
    if (!requestTarget) return;
    setRequestBusy(true);
    setRequestError(null);
    try {
      const r = await fetch(
        `/api/bookings/${encodeURIComponent(requestTarget.row.id)}/reject`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: reason ? JSON.stringify({ reason }) : '',
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRequestTarget(null);
      await refresh();
    } catch {
      setRequestError(t('bookings.rejectFailed'));
    } finally {
      setRequestBusy(false);
    }
  };

  return (
    <div className={accountStyles.app}>
      <PageHeader homeHref={homeHref} />
      <main className={accountStyles.main}>
        <div className={accountStyles.hero}>
          <h1 className={accountStyles.pageTitle}>{t('bookings.title')}</h1>
          <p className={accountStyles.lead}>{t('bookings.lead')}</p>
        </div>

        <div className={styles.viewBar}>
          <span className={styles.tzLabel}>{t('bookings.viewShowing')}</span>
          <span className={styles.tzGroup} role="group" aria-label={t('bookings.viewShowing')}>
            <button
              type="button"
              className={`${styles.tzOption} ${viewMode === 'list' ? styles.tzOptionSelected : ''}`}
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
            >
              {t('bookings.viewList')}
            </button>
            <button
              type="button"
              className={`${styles.tzOption} ${viewMode === 'week' ? styles.tzOptionSelected : ''}`}
              onClick={() => setViewMode('week')}
              aria-pressed={viewMode === 'week'}
            >
              {t('bookings.viewWeek')}
            </button>
          </span>
        </div>

        {!tzMatches ? (
          <p className={styles.tzBar}>
            <span className={styles.tzLabel}>{t('bookings.tzShowing')}</span>
            <span className={styles.tzGroup} role="group" aria-label={t('bookings.tzShowing')}>
              <button
                type="button"
                className={`${styles.tzOption} ${tzMode === 'home' ? styles.tzOptionSelected : ''}`}
                onClick={() => setTzMode('home')}
                aria-pressed={tzMode === 'home'}
              >
                {t('bookings.tzHome', { zone: homeTz })}
              </button>
              <button
                type="button"
                className={`${styles.tzOption} ${tzMode === 'local' ? styles.tzOptionSelected : ''}`}
                onClick={() => setTzMode('local')}
                aria-pressed={tzMode === 'local'}
              >
                {t('bookings.tzLocal', { zone: localTz })}
              </button>
            </span>
          </p>
        ) : null}

        {state.kind === 'loading' ? (
          <section className={accountStyles.card} aria-busy="true">
            <div className={`${accountStyles.skeletonRow} ${accountStyles.skeletonRowShort}`} />
            <div className={accountStyles.skeletonRow} style={{ marginTop: '0.6rem' }} />
          </section>
        ) : state.kind === 'error' ? (
          <section className={accountStyles.card}>
            <p className={styles.empty}>{t('bookings.loadFailed')}</p>
          </section>
        ) : (
          <>
            {/* Pending requests sit above both views — they don't have a
                café yet so they don't fit the week grid, and they need
                an action (approve/reject) so they need to be visible
                regardless of view mode. */}
            <PendingRequestsSection
              rows={state.bookings.filter((r) => r.status === 'requested')}
              onApprove={(row) => {
                setRequestError(null);
                setRequestTarget({ row, intent: 'approve' });
              }}
              onReject={(row) => {
                setRequestError(null);
                setRequestTarget({ row, intent: 'reject' });
              }}
              locale={locale}
              timezone={effectiveTz}
              t={t}
            />
            {viewMode === 'week' ? (
              <WeekGridView
                rows={state.bookings.filter((r) => r.status !== 'requested')}
                anchorMs={weekAnchorMs}
                onAnchorChange={setWeekAnchorMs}
                onCancelClick={(row) => setActionTarget({ row, intent: 'cancel' })}
                locale={locale}
                timezone={effectiveTz}
                t={t}
              />
            ) : (
              <BookingsList
                rows={state.bookings.filter((r) => r.status !== 'requested')}
                onCancelClick={(row) => setActionTarget({ row, intent: 'cancel' })}
                onRescheduleClick={(row) => setActionTarget({ row, intent: 'reschedule' })}
                cancellingId={cancelling ? actionTarget?.row.id ?? null : null}
                locale={locale}
                timezone={effectiveTz}
                t={t}
              />
            )}
          </>
        )}
      </main>

      {actionTarget ? (
        <ActionConfirmModal
          target={actionTarget.row}
          intent={actionTarget.intent}
          locale={locale}
          timezone={effectiveTz}
          busy={cancelling}
          error={cancelError}
          onClose={() => {
            if (!cancelling) {
              setActionTarget(null);
              setCancelError(null);
            }
          }}
          onConfirm={() => void confirmAction()}
          t={t}
        />
      ) : null}

      {requestTarget?.intent === 'approve' ? (
        <ApproveRequestModal
          target={requestTarget.row}
          locale={locale}
          timezone={effectiveTz}
          busy={requestBusy}
          error={requestError}
          featuredCafes={featuredCafes}
          onLoadFeaturedCafes={() => {
            // Lazy: only hit /api/account when the modal opens for the
            // first time. Cached for the rest of the session.
            if (featuredCafes != null) return;
            void (async () => {
              try {
                const r = await fetch('/api/account', { credentials: 'include' });
                if (!r.ok) {
                  setFeaturedCafes([]);
                  return;
                }
                const json = (await r.json()) as {
                  featuredCafes?: Array<{
                    placeId: string;
                    name: string;
                    address: string;
                    lat: number;
                    lng: number;
                    googleMapsUri?: string | null;
                  }>;
                };
                setFeaturedCafes(
                  (json.featuredCafes ?? []).map((c) => ({
                    placeId: c.placeId,
                    name: c.name,
                    address: c.address,
                    lat: c.lat,
                    lng: c.lng,
                    googleMapsUri: c.googleMapsUri ?? null,
                  })),
                );
              } catch {
                setFeaturedCafes([]);
              }
            })();
          }}
          onClose={() => {
            if (!requestBusy) {
              setRequestTarget(null);
              setRequestError(null);
            }
          }}
          onApprove={(payload) => void approveRequest(payload)}
          t={t}
        />
      ) : null}

      {requestTarget?.intent === 'reject' ? (
        <RejectRequestModal
          target={requestTarget.row}
          locale={locale}
          timezone={effectiveTz}
          busy={requestBusy}
          error={requestError}
          onClose={() => {
            if (!requestBusy) {
              setRequestTarget(null);
              setRequestError(null);
            }
          }}
          onReject={(reason) => void rejectRequest(reason)}
          t={t}
        />
      ) : null}
    </div>
  );
}

interface ActionModalProps {
  target: BookingWire;
  intent: 'cancel' | 'reschedule';
  locale: string;
  timezone: string;
  busy: boolean;
  /** Surfaced inside the dialog so the user sees a failed cancel
   *  without having to dismiss the modal first. */
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
  t: ReturnType<typeof useI18n>['t'];
}

function ActionConfirmModal({
  target,
  intent,
  locale,
  timezone,
  busy,
  error,
  onClose,
  onConfirm,
  t,
}: ActionModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Focus management:
  // - Move focus to the first interactive control on mount so keyboard
  //   users land inside the dialog rather than on the page chrome.
  // - Trap Tab/Shift+Tab inside dialogRef so the modal is actually
  //   modal — without this, AT users can tab onto the row buttons
  //   sitting underneath and trigger them while the dialog claims to
  //   own focus.
  // - Escape closes (when not busy).
  useEffect(() => {
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const start = new Date(target.scheduledAt);
  const when = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(start);

  const isReschedule = intent === 'reschedule';
  const titleKey = isReschedule ? 'bookings.rescheduleModalTitle' : 'bookings.cancelModalTitle';
  const bodyKey = isReschedule ? 'bookings.confirmReschedule' : 'bookings.confirmCancel';
  const confirmKey = isReschedule
    ? 'bookings.rescheduleModalConfirm'
    : 'bookings.cancelModalConfirm';
  const busyKey = isReschedule ? 'bookings.rescheduling' : 'bookings.cancelling';

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-modal-title"
      onClick={(e) => {
        // Backdrop click closes only when not mid-cancel — a stray
        // tap on the dim area shouldn't fire-and-forget the request
        // the user is watching.
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div ref={dialogRef} className={styles.modalDialog}>
        <h3 id="action-modal-title" className={styles.modalTitle}>
          {t(titleKey)}
        </h3>
        <p className={styles.modalBody}>{t(bodyKey)}</p>
        <div className={styles.modalSummary}>
          <strong>{target.visitorName}</strong> · {when}
          <br />
          {target.placeName}
        </div>
        {error ? (
          <p className={styles.modalError} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.modalKeep}
            onClick={onClose}
            disabled={busy}
          >
            {t('bookings.cancelModalKeep')}
          </button>
          <button
            type="button"
            className={styles.modalConfirm}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? t(busyKey) : t(confirmKey)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Pending requests section + approve/reject modals
// ─────────────────────────────────────────────────────────────────────

interface PendingRequestsProps {
  rows: BookingWire[];
  onApprove: (row: BookingWire) => void;
  onReject: (row: BookingWire) => void;
  locale: string;
  timezone: string;
  t: ReturnType<typeof useI18n>['t'];
}

/**
 * Section above the regular list that surfaces 'requested' bookings —
 * visitors who've sent a request but haven't been approved or rejected
 * yet. Each row gets primary Approve / secondary Reject buttons.
 * Hides itself when there are no pending requests.
 */
function PendingRequestsSection({
  rows,
  onApprove,
  onReject,
  locale,
  timezone,
  t,
}: PendingRequestsProps) {
  if (rows.length === 0) return null;
  // Soonest first so the most-time-sensitive request bubbles up.
  const sorted = [...rows].sort((a, b) => a.scheduledAt - b.scheduledAt);
  return (
    <section className={accountStyles.card} aria-label={t('bookings.pendingTitle')}>
      <h2 className={styles.sectionTitle}>
        {t('bookings.pendingTitle')} ({rows.length})
      </h2>
      <p className={styles.pendingLead}>{t('bookings.pendingLead')}</p>
      <ul className={styles.list}>
        {sorted.map((row) => (
          <PendingRequestRow
            key={row.id}
            row={row}
            onApprove={() => onApprove(row)}
            onReject={() => onReject(row)}
            locale={locale}
            timezone={timezone}
            t={t}
          />
        ))}
      </ul>
    </section>
  );
}

interface PendingRowProps {
  row: BookingWire;
  onApprove: () => void;
  onReject: () => void;
  locale: string;
  timezone: string;
  t: ReturnType<typeof useI18n>['t'];
}

function PendingRequestRow({
  row,
  onApprove,
  onReject,
  locale,
  timezone,
  t,
}: PendingRowProps) {
  const start = new Date(row.scheduledAt);
  const dateLine = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(start);
  return (
    <li className={`${styles.row} ${styles.rowPending}`}>
      <div>
        <p className={styles.when}>
          {dateLine}
          <span className={`${styles.statusPill} ${styles.statusPillPending}`}>
            {t('bookings.statusPendingApproval')}
          </span>
        </p>
        <div className={styles.body}>
          <span>
            <strong>{row.visitorName}</strong> ·{' '}
            <a className={styles.email} href={`mailto:${row.visitorEmail}`}>
              {row.visitorEmail}
            </a>
          </span>
          {row.visitorAddress ? (
            <span className={styles.placeAddress}>
              {t('bookings.visitorAddressLabel')} {row.visitorAddress}
            </span>
          ) : null}
          {row.visitorMessage ? (
            <span className={styles.visitorMessage}>
              <span className={styles.visitorMessageLabel}>{t('bookings.theirNote')}</span>
              {row.visitorMessage}
            </span>
          ) : null}
        </div>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.approveButton}
          onClick={onApprove}
        >
          {t('bookings.approveCta')}
        </button>
        <button
          type="button"
          className={styles.rejectButton}
          onClick={onReject}
        >
          {t('bookings.rejectCta')}
        </button>
      </div>
    </li>
  );
}

interface ApproveModalProps {
  target: BookingWire;
  locale: string;
  timezone: string;
  busy: boolean;
  error: string | null;
  /** Host's featured cafés rendered as quick-pick chips above the
   *  search box. null = not yet fetched (loading); [] = no featured
   *  cafés set up. */
  featuredCafes: FeaturedCafeQuickPick[] | null;
  onLoadFeaturedCafes: () => void;
  onClose: () => void;
  onApprove: (payload: {
    placeId: string;
    placeName: string;
    placeAddress: string;
    placeLat: number;
    placeLng: number;
    /** Google Maps deep link from the cafe pick — autocomplete or
     *  passport quick-pick will populate it; featured-cafe quick-picks
     *  don't yet (the featured_cafes table doesn't store it). */
    googleMapsUri?: string | null;
    /** Only sent when host changed the time. */
    scheduledAt?: number;
  }) => void;
  t: ReturnType<typeof useI18n>['t'];
}

function ApproveRequestModal({
  target,
  locale,
  timezone,
  busy,
  error,
  featuredCafes,
  onLoadFeaturedCafes,
  onClose,
  onApprove,
  t,
}: ApproveModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Mount-only side effects: focus the search input and trigger the
   * featured-cafés lazy load. Split from the keydown effect below
   * because including `busy` in this deps list would re-fire focus
   * the moment the host clicks Approve — pulling focus out of any
   * datetime-local input mid-edit. */
  useEffect(() => {
    inputRef.current?.focus();
    onLoadFeaturedCafes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Standard focus-trap (same as ActionConfirmModal). Re-binding the
   * keydown handler when `busy` flips is cheap and correct — it only
   * swaps the listener, no focus side effect — so we keep busy in the
   * deps so the Escape gate sees the current state. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const acLanguage = locale === 'zh' ? 'zh-CN' : locale;
  const cafeAutocomplete = useCafeAutocomplete(acLanguage);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<PickedCafe | null>(null);

  /* Passport-derived quick picks. Auto-stamping on approve means the
   * host's visited_shops list grows organically with every coffee they
   * actually had — so by their second or third booking, "your usual
   * spots" is full of real signal instead of empty. We rank by visit
   * count desc and filter out cafes already in featuredCafes so the
   * row doesn't duplicate the curated list above. */
  const { visitedShops } = useApp();
  const passportTop = useMemo(() => {
    const featuredIds = new Set((featuredCafes ?? []).map((c) => c.placeId));
    /* AppContext already strips tombstoned rows before exposing
     * visitedShops to consumers, so no deleted check is needed here. */
    return visitedShops
      .filter((s) => s.visits.length > 0 && !featuredIds.has(s.id))
      .slice()
      .sort((a, b) => b.visits.length - a.visits.length || a.name.localeCompare(b.name))
      .slice(0, 5);
  }, [visitedShops, featuredCafes]);

  // Time-editor state. `editingTime` toggles the section open/closed;
  // `proposedTimeMs` holds the host's edit (null = same as request).
  const [editingTime, setEditingTime] = useState(false);
  const [proposedTimeMs, setProposedTimeMs] = useState<number | null>(null);
  const effectiveTimeMs = proposedTimeMs ?? target.scheduledAt;

  const start = new Date(target.scheduledAt);
  const when = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(start);
  const proposedWhen =
    proposedTimeMs != null
      ? new Intl.DateTimeFormat(locale, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: timezone,
        }).format(new Date(proposedTimeMs))
      : null;
  // datetime-local input expects "YYYY-MM-DDTHH:mm" in *local* time —
  // convert from UTC ms via the user's local zone (NOT the row's
  // organizer timezone, since the input is going through the host's
  // browser keyboard).
  const toDatetimeLocalValue = (ms: number) => {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="approve-modal-title"
      onClick={(e) => {
        // Don't backdrop-dismiss once the host has picked a café — they
        // probably want to actually approve.
        if (e.target === e.currentTarget && !busy && !picked) onClose();
      }}
    >
      <div ref={dialogRef} className={styles.modalDialog}>
        <h3 id="approve-modal-title" className={styles.modalTitle}>
          {t('bookings.approveModalTitle')}
        </h3>
        <p className={styles.modalBody}>{t('bookings.approveModalBody')}</p>
        <div className={styles.modalSummary}>
          <strong>{target.visitorName}</strong>{' '}
          <a
            className={styles.email}
            href={`mailto:${target.visitorEmail}`}
            style={{ color: 'inherit' }}
          >
            ({target.visitorEmail})
          </a>
          <br />
          {/* Strike-through original time when host has proposed a new
              one, so the diff is obvious before they hit Send. */}
          {proposedWhen ? (
            <>
              <span style={{ textDecoration: 'line-through', color: 'var(--ac-text-muted)' }}>
                {when}
              </span>
              {' → '}
              <strong>{proposedWhen}</strong>
            </>
          ) : (
            when
          )}
          {target.visitorAddress ? (
            <>
              <br />
              <span style={{ color: 'var(--ac-text-muted)' }}>
                {t('bookings.visitorAddressLabel')} {target.visitorAddress}
              </span>
            </>
          ) : null}
        </div>

        {/* Visitor's free-text note — shown inside the modal too so the
            host doesn't have to dismiss to read it. */}
        {target.visitorMessage ? (
          <div className={styles.modalVisitorMessage}>
            <span className={styles.visitorMessageLabel}>
              {t('bookings.theirNote')}
            </span>
            {target.visitorMessage}
          </div>
        ) : null}

        {/* Café picker — Places autocomplete + featured cafés as quick
            picks. Once the host clicks a suggestion / quick-pick, the
            chosen café renders as a confirmed card with a swap option. */}
        <div className={styles.cafePicker}>
          {picked ? (
            <div className={styles.cafePickedCard}>
              <div className={styles.cafePickedName}>{picked.name}</div>
              <div className={styles.cafePickedAddress}>{picked.address}</div>
              <button
                type="button"
                className={styles.cafePickedSwap}
                onClick={() => {
                  setPicked(null);
                  setQuery('');
                  inputRef.current?.focus();
                }}
                disabled={busy}
              >
                {t('bookings.cafePickAnother')}
              </button>
            </div>
          ) : (
            <>
              {featuredCafes && featuredCafes.length > 0 ? (
                <div className={styles.cafeQuickPicks}>
                  <p className={styles.cafeQuickPicksLabel}>
                    {t('bookings.cafeQuickPicksLabel')}
                  </p>
                  <div className={styles.cafeQuickPicksRow}>
                    {featuredCafes.map((c) => (
                      <button
                        key={c.placeId}
                        type="button"
                        className={styles.cafeQuickPick}
                        onClick={() =>
                          setPicked({
                            placeId: c.placeId,
                            name: c.name,
                            address: c.address,
                            lat: c.lat,
                            lng: c.lng,
                            websiteUri: null,
                            googleMapsUri: c.googleMapsUri,
                          })
                        }
                        disabled={busy}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {passportTop.length > 0 ? (
                <div className={styles.cafeQuickPicks}>
                  <p className={styles.cafeQuickPicksLabel}>
                    {t('bookings.cafeFromPassportLabel')}
                  </p>
                  <div className={styles.cafeQuickPicksRow}>
                    {passportTop.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={styles.cafeQuickPick}
                        onClick={() =>
                          setPicked({
                            placeId: s.id,
                            name: s.name,
                            address: s.address,
                            lat: s.lat,
                            lng: s.lng,
                            websiteUri: null,
                            /* visited_shops stores googleMapsUri so the
                             * approve email's "Open in Maps" CTA works
                             * for picks coming from the host's history. */
                            googleMapsUri: s.googleMapsUri ?? null,
                          })
                        }
                        disabled={busy}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <label className={styles.cafePickerLabel}>
                <span>{t('bookings.cafePickerLabel')}</span>
                <input
                  ref={inputRef}
                  type="text"
                  className={styles.cafePickerInput}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    cafeAutocomplete.query(e.target.value);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => cafeAutocomplete.clear(), 150);
                  }}
                  placeholder={t('bookings.cafePickerPlaceholder')}
                  disabled={busy}
                  aria-autocomplete="list"
                  aria-expanded={cafeAutocomplete.suggestions.length > 0}
                />
              </label>
              {cafeAutocomplete.suggestions.length > 0 ? (
                <ul
                  className={styles.cafeSuggestions}
                  role="listbox"
                  aria-label={t('bookings.cafePickerLabel')}
                >
                  {cafeAutocomplete.suggestions.map((s, i) => {
                    const text = s.placePrediction?.text.text ?? '';
                    if (!text) return null;
                    return (
                      <li key={`${i}-${text}`} role="option" aria-selected={false}>
                        <button
                          type="button"
                          className={styles.cafeSuggestion}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={async () => {
                            if (picking) return;
                            setPicking(true);
                            try {
                              const result = await cafeAutocomplete.pick(s);
                              if (result) {
                                setPicked(result);
                                setQuery('');
                              }
                            } finally {
                              setPicking(false);
                            }
                          }}
                          disabled={picking || busy}
                        >
                          {text}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </>
          )}
        </div>

        {/* Optional time-change section. Default-collapsed because most
            approvals keep the visitor's original time; clicking the
            link reveals a datetime-local input populated with the
            existing slot. */}
        <div className={styles.timeEdit}>
          {!editingTime ? (
            <button
              type="button"
              className={styles.timeEditToggle}
              onClick={() => setEditingTime(true)}
              disabled={busy}
            >
              {t('bookings.proposeNewTime')}
            </button>
          ) : (
            <div className={styles.timeEditPanel}>
              <label className={styles.timeEditLabel}>
                <span>{t('bookings.proposeNewTimeLabel')}</span>
                <input
                  type="datetime-local"
                  className={styles.timeEditInput}
                  value={toDatetimeLocalValue(effectiveTimeMs)}
                  onChange={(e) => {
                    const ms = new Date(e.target.value).getTime();
                    if (Number.isFinite(ms)) {
                      /* datetime-local input rounds to the nearest
                       * minute, but target.scheduledAt is millisecond.
                       * Strict equality almost never holds even when
                       * the host re-picks the original slot — and a
                       * non-null proposedTimeMs makes the host send a
                       * "new time" notice for an unchanged time.
                       * Round both to minute precision for the
                       * compare. */
                      const minute = (n: number) =>
                        Math.floor(n / 60_000) * 60_000;
                      setProposedTimeMs(
                        minute(ms) === minute(target.scheduledAt) ? null : ms,
                      );
                    }
                  }}
                  disabled={busy}
                />
              </label>
              <p className={styles.timeEditHint}>{t('bookings.proposeNewTimeHint')}</p>
              <button
                type="button"
                className={styles.timeEditClear}
                onClick={() => {
                  setEditingTime(false);
                  setProposedTimeMs(null);
                }}
                disabled={busy}
              >
                {t('bookings.proposeNewTimeReset')}
              </button>
            </div>
          )}
        </div>

        {error ? (
          <p className={styles.modalError} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.modalKeep}
            onClick={onClose}
            disabled={busy}
          >
            {t('bookings.cancelModalKeep')}
          </button>
          <button
            type="button"
            className={styles.modalConfirm}
            onClick={() => {
              if (!picked) return;
              onApprove({
                placeId: picked.placeId,
                placeName: picked.name,
                placeAddress: picked.address,
                placeLat: picked.lat,
                placeLng: picked.lng,
                /* Pulled from autocomplete (now requests googleMapsURI)
                 * or the passport quick-pick (visited_shops stores it).
                 * Featured-cafe quick-picks don't have it; sending null
                 * is fine — server treats it as "no Maps link". */
                ...(picked.googleMapsUri ? { googleMapsUri: picked.googleMapsUri } : {}),
                ...(proposedTimeMs != null ? { scheduledAt: proposedTimeMs } : {}),
              });
            }}
            disabled={busy || !picked}
          >
            {busy ? t('bookings.approving') : t('bookings.approveModalConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface RejectModalProps {
  target: BookingWire;
  locale: string;
  timezone: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onReject: (reason: string | undefined) => void;
  t: ReturnType<typeof useI18n>['t'];
}

function RejectRequestModal({
  target,
  locale,
  timezone,
  busy,
  error,
  onClose,
  onReject,
  t,
}: RejectModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initial-focus on mount only — see ApproveRequestModal for why this
  // can't share the keydown effect's deps.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const [reason, setReason] = useState('');
  const start = new Date(target.scheduledAt);
  const when = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(start);

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy && reason.trim().length === 0) {
          onClose();
        }
      }}
    >
      <div ref={dialogRef} className={styles.modalDialog}>
        <h3 id="reject-modal-title" className={styles.modalTitle}>
          {t('bookings.rejectModalTitle')}
        </h3>
        <p className={styles.modalBody}>{t('bookings.rejectModalBody')}</p>
        <div className={styles.modalSummary}>
          <strong>{target.visitorName}</strong> · {when}
        </div>
        <label className={styles.rejectReasonLabel}>
          <span>{t('bookings.rejectReasonLabel')}</span>
          <textarea
            ref={textareaRef}
            className={styles.rejectReasonInput}
            rows={3}
            maxLength={300}
            placeholder={t('bookings.rejectReasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
        </label>
        {error ? (
          <p className={styles.modalError} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.modalKeep}
            onClick={onClose}
            disabled={busy}
          >
            {t('bookings.cancelModalKeep')}
          </button>
          <button
            type="button"
            className={styles.modalConfirm}
            onClick={() => onReject(reason.trim() || undefined)}
            disabled={busy}
          >
            {busy ? t('bookings.rejecting') : t('bookings.rejectModalConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Signed-out fallback for /bookings. Hosts arrive here from the email
 * link "X wants to grab a coffee — open /bookings" — sometimes in a
 * logged-out browser (different device, fresh window). The previous
 * version dead-ended them with "Sign in required + Go home"; they had
 * to navigate home, find the account menu, sign in, then come back.
 * This inline AuthModal closes that gap. callbackURL points back at
 * /bookings so a successful sign-in lands them where they were
 * heading.
 */
function BookingsSignedOut({
  homeHref,
  callbackURL,
}: {
  homeHref: string;
  callbackURL: string;
}) {
  const { t } = useI18n();
  const [authOpen, setAuthOpen] = useState(false);
  const authEnabled = import.meta.env.VITE_AUTH_ENABLED === 'true';
  return (
    <div className={accountStyles.app}>
      <SkipToContent />
      <PageHeader homeHref={homeHref} />
      <main id="content" tabIndex={-1} className={accountStyles.main}>
        <div className={accountStyles.signedOut}>
          <p>{t('bookings.signInRequired')}</p>
          <div className={accountStyles.signedOutActions}>
            {authEnabled ? (
              <button
                type="button"
                className={accountStyles.signedOutCta}
                onClick={() => setAuthOpen(true)}
              >
                {t('bookings.signInCta')}
              </button>
            ) : null}
            <a className={accountStyles.signedOutLink} href={homeHref}>
              {t('bookings.goHome')}
            </a>
          </div>
        </div>
      </main>
      {authOpen ? (
        <Suspense fallback={null}>
          <AuthModal
            open={authOpen}
            onClose={() => setAuthOpen(false)}
            callbackURL={callbackURL}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function PageHeader({ homeHref }: { homeHref: string }) {
  const { t } = useI18n();
  return (
    <header className={accountStyles.header}>
      <div className={accountStyles.headerInner}>
        <a className={accountStyles.logo} href={homeHref} aria-label={t('app.logoAlt')}>
          <span className={accountStyles.logoWordmark}>ACoffee</span>
        </a>
        <HeaderNavLinks />
        <div className={accountStyles.headerAside}>
          <LanguageSwitcher />
          {import.meta.env.VITE_AUTH_ENABLED === 'true' ? (
            <>
              <SyncIndicator />
              <AccountMenu />
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}

interface WeekGridProps {
  rows: BookingWire[];
  anchorMs: number;
  onAnchorChange: (next: number) => void;
  onCancelClick: (row: BookingWire) => void;
  locale: string;
  timezone: string;
  t: ReturnType<typeof useI18n>['t'];
}

/**
 * Week grid: 7 columns Mon→Sun anchored on `anchorMs`. Each booking on a
 * day shows up as a tappable colored block (sage for active, dimmed for
 * cancelled). Hours aren't laid out explicitly — just stack the day's
 * bookings vertically with a time prefix. Keeps the v1 simple while still
 * giving the host a "what's my coffee week look like" mental model.
 *
 * Day grouping uses the configured `timezone`, so flipping the TZ toggle
 * in the parent re-buckets bookings into the right local day.
 */
function WeekGridView({
  rows,
  anchorMs,
  onAnchorChange,
  onCancelClick,
  locale,
  timezone,
  t,
}: WeekGridProps) {
  // ── Date-string arithmetic instead of UTC ms ──
  // The previous implementation walked back `offsetDays * MS_DAY` from
  // anchorMs in UTC ms, then projected each `+ i * MS_DAY` into the
  // target zone. That breaks across DST: in spring-forward weeks the
  // visible grid would skip Saturday and double-count Sunday.
  //
  // The fix: do everything in YYYY-MM-DD strings projected through
  // Intl.DateTimeFormat. Each operation is calendar arithmetic, not
  // wall-clock ms arithmetic — DST is invisible.

  // Project a UTC ms into the target zone's calendar date.
  const formatDayKey = (ms: number) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));

  // Date at UTC noon for a YYYY-MM-DD — used purely as a vehicle for
  // calendar formatters (we always pass `timeZone: 'UTC'` when reading
  // it, so noon is well above any sub-12h zone offset).
  const keyToUtcNoon = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  };

  // Shift a YYYY-MM-DD by N calendar days. UTC noon + `timeZone:'UTC'`
  // formatter = pure calendar arithmetic, no DST drift possible.
  const shiftKey = (key: string, deltaDays: number) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0)));
  };

  // Weekday of anchor in target zone (Mon=0..Sun=6).
  const anchorWeekdayShort = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(new Date(anchorMs));
  const weekdayMap: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  const anchorWeekday = weekdayMap[anchorWeekdayShort] ?? 0;

  const anchorKey = formatDayKey(anchorMs);
  // Floor to Monday in target zone via calendar arithmetic.
  const weekStartKey = shiftKey(anchorKey, -anchorWeekday);
  const dayKeys = Array.from({ length: 7 }, (_, i) => shiftKey(weekStartKey, i));

  // Bucket bookings by viewer-of-record (organizer) timezone day.
  const byDay = new Map<string, BookingWire[]>();
  for (const r of rows) {
    const k = formatDayKey(r.scheduledAt);
    const list = byDay.get(k) ?? [];
    list.push(r);
    byDay.set(k, list);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.scheduledAt - b.scheduledAt);
  }

  // eslint-disable-next-line react-hooks/purity
  const todayKey = formatDayKey(Date.now());

  // Week title — format Mon and Sun calendar dates via UTC-noon Date +
  // UTC formatter so we render the intended calendar date regardless
  // of any zone-offset surprise.
  const weekTitleFmt = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const start = keyToUtcNoon(dayKeys[0]);
  const end = keyToUtcNoon(dayKeys[6]);
  const weekTitle = `${weekTitleFmt.format(start)} – ${weekTitleFmt.format(end)}`;

  // "This week" = today's calendar date (in target zone) is one of the
  // seven visible day keys. String compare on YYYY-MM-DD is
  // chronologically correct and side-steps DST entirely.
  const isThisWeek = todayKey >= dayKeys[0] && todayKey <= dayKeys[6];
  return (
    <section className={accountStyles.card}>
      <div className={styles.weekHeader}>
        <button
          type="button"
          className={styles.weekNav}
          onClick={() =>
            // Shift the anchor by 7 calendar days, then return UTC noon
            // of the new key as the new anchorMs. UTC ms ±7d would drift
            // by ±1h across DST and (worst case at near-midnight anchors)
            // not cross the calendar-week boundary at all.
            onAnchorChange(keyToUtcNoon(shiftKey(anchorKey, -7)).getTime())
          }
          aria-label={t('bookings.weekPrev')}
        >
          ←
        </button>
        <h2 className={styles.weekTitle}>{weekTitle}</h2>
        <button
          type="button"
          className={styles.weekNav}
          onClick={() =>
            onAnchorChange(keyToUtcNoon(shiftKey(anchorKey, 7)).getTime())
          }
          aria-label={t('bookings.weekNext')}
        >
          →
        </button>
        <button
          type="button"
          className={styles.weekTodayButton}
          onClick={() => onAnchorChange(Date.now())}
          disabled={isThisWeek}
        >
          {t('bookings.weekToday')}
        </button>
      </div>
      <div className={styles.weekGrid}>
        {dayKeys.map((k) => {
          const list = byDay.get(k) ?? [];
          const isToday = k === todayKey;
          // YYYY-MM-DD lex-orders chronologically — no UTC ms math
          // needed for "is this day already past."
          const isPast = k < todayKey;
          const cls = [
            styles.dayCol,
            isToday && styles.dayColToday,
            !isToday && isPast && styles.dayColPast,
          ]
            .filter(Boolean)
            .join(' ');
          // UTC noon Date + UTC formatter = render the intended calendar
          // date regardless of any zone offset.
          const dayDate = keyToUtcNoon(k);
          return (
            <div key={k} className={cls}>
              <div className={styles.dayLabel}>
                {new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
                  dayDate,
                )}
              </div>
              <div className={styles.dayDate}>
                {new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' }).format(
                  dayDate,
                )}
              </div>
              {list.map((row) => {
                const isCancelled = row.status === 'cancelled';
                const blockCls = `${styles.dayBlock} ${isCancelled ? styles.dayBlockCancelled : ''}`;
                const time = new Intl.DateTimeFormat(locale, {
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZone: timezone,
                }).format(new Date(row.scheduledAt));
                if (isCancelled) {
                  // Render as a real disabled <button> so it shows up in
                  // the keyboard tab order with a clear "unavailable"
                  // affordance instead of an inert <span> that screen
                  // readers skip past entirely.
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className={blockCls}
                      disabled
                      aria-disabled="true"
                      aria-label={t('bookings.weekBlockAria', {
                        name: row.visitorName,
                        time,
                      })}
                    >
                      <span className={styles.dayBlockTime}>{time}</span>
                      <span className={styles.dayBlockName}>{row.visitorName}</span>
                    </button>
                  );
                }
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={blockCls}
                    onClick={() => onCancelClick(row)}
                    aria-label={t('bookings.weekBlockAria', {
                      name: row.visitorName,
                      time,
                    })}
                  >
                    <span className={styles.dayBlockTime}>{time}</span>
                    <span className={styles.dayBlockName}>{row.visitorName}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {/* Empty state for the visible week — different from the page-level
          "no bookings yet" because the user may have plenty of bookings,
          just none in this 7-day window. */}
      {dayKeys.every((k) => (byDay.get(k) ?? []).length === 0) ? (
        <p className={styles.weekEmpty}>{t('bookings.weekEmpty')}</p>
      ) : null}
    </section>
  );
}

interface ListProps {
  rows: BookingWire[];
  onCancelClick: (row: BookingWire) => void;
  onRescheduleClick: (row: BookingWire) => void;
  cancellingId: string | null;
  locale: string;
  timezone: string;
  t: ReturnType<typeof useI18n>['t'];
}

function BookingsList({
  rows,
  onCancelClick,
  onRescheduleClick,
  cancellingId,
  locale,
  timezone,
  t,
}: ListProps) {
  // The "is this in the past?" cut is a render-time check; if the user leaves
  // the page open across a slot start the row will still appear under
  // "Upcoming" until the next data refresh, which is fine for our purposes.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  /* Upcoming = anything not cancelled and where the meeting hasn't
   * ended yet. We measure the END of the slot (scheduledAt + duration),
   * not the start, so a meeting that's *currently happening* stays in
   * Upcoming until the host actually finishes — instead of dropping
   * to Past the moment the clock crosses the start time. Without this,
   * a host reading their phone at the cafe sees their own meeting in
   * the Past list while still sitting at the table. */
  const endOfMeeting = (r: { scheduledAt: number; durationMinutes: number }) =>
    r.scheduledAt + r.durationMinutes * 60_000;
  const upcoming = rows.filter(
    (r) => r.status !== 'cancelled' && endOfMeeting(r) > now,
  );
  const archived = rows
    .filter((r) => r.status === 'cancelled' || endOfMeeting(r) <= now)
    // Past + cancelled: most recent first.
    .sort((a, b) => b.scheduledAt - a.scheduledAt);

  if (rows.length === 0) {
    return (
      <section className={accountStyles.card}>
        <p className={styles.empty}>{t('bookings.empty')}</p>
      </section>
    );
  }

  return (
    <>
      <section className={accountStyles.card}>
        <h2 className={styles.sectionTitle}>
          {t('bookings.upcomingTitle')}
          {upcoming.length > 0 ? ` (${upcoming.length})` : ''}
        </h2>
        {upcoming.length === 0 ? (
          <p className={styles.empty}>{t('bookings.noUpcoming')}</p>
        ) : (
          <ul className={styles.list}>
            {upcoming.map((row) => (
              <BookingRow
                key={row.id}
                row={row}
                locale={locale}
                timezone={timezone}
                t={t}
                cancellable
                cancelling={cancellingId === row.id}
                onCancel={() => onCancelClick(row)}
                onReschedule={() => onRescheduleClick(row)}
              />
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 ? (
        <section className={accountStyles.card}>
          <h2 className={styles.sectionTitle}>{t('bookings.pastTitle')}</h2>
          <ul className={styles.list}>
            {archived.map((row) => (
              <BookingRow key={row.id} row={row} locale={locale} timezone={timezone} t={t} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

interface RowProps {
  row: BookingWire;
  locale: string;
  timezone: string;
  t: ReturnType<typeof useI18n>['t'];
  cancellable?: boolean;
  cancelling?: boolean;
  onCancel?: () => void;
  onReschedule?: () => void;
}

function BookingRow({
  row,
  locale,
  timezone,
  t,
  cancellable,
  cancelling,
  onCancel,
  onReschedule,
}: RowProps) {
  // Same trade-off as BookingsList — past/future status is recomputed each
  // render; tab left open across a slot start gets the styling on the next
  // refresh.
  // eslint-disable-next-line react-hooks/purity
  const isPast = row.scheduledAt <= Date.now();
  const isCancelled = row.status === 'cancelled';
  const cls = [styles.row, isCancelled && styles.rowCancelled, !isCancelled && isPast && styles.rowPast]
    .filter(Boolean)
    .join(' ');
  const start = new Date(row.scheduledAt);
  const end = new Date(row.scheduledAt + row.durationMinutes * 60_000);
  // Year only when not the current year — keeps the line tight for the
  // common case but stays unambiguous near year boundaries / long-tail
  // bookings. Resolve current year in the configured TZ so it matches the
  // visible date.
  const startYearInTz = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric' }).format(start),
  );
  const nowYearInTz = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric' }).format(new Date()),
  );
  const dateLine = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: startYearInTz === nowYearInTz ? undefined : 'numeric',
    timeZone: timezone,
  }).format(start);
  const timeLine =
    new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    }).format(start) +
    ' – ' +
    new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    }).format(end);
  const mapsHref =
    row.placeId
      ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(row.placeId)}`
      : null;
  /* Get-directions link uses placeId + name for accuracy. Only renders
   * for confirmed/pending rows where there's an actual cafe (request
   * + cancelled rows have placeId=null). Sage tone matches the same
   * affordance on CoffeeShopCard so users learn the visual language. */
  const directionsHref =
    row.placeId
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
          row.placeName ?? row.placeAddress ?? '',
        )}&destination_place_id=${encodeURIComponent(row.placeId)}`
      : null;

  return (
    <li className={cls}>
      <div>
        <p className={styles.when}>
          {dateLine}
          {isCancelled ? (
            <span className={styles.statusPill}>{t('bookings.statusCancelled')}</span>
          ) : isPast ? (
            // Neutral pill for past-not-cancelled rows so the user can
            // tell at a glance which rows already happened — without it
            // archived rows look identical to upcoming until you read
            // the full date.
            <span className={`${styles.statusPill} ${styles.statusPillPast}`}>
              {t('bookings.statusPast')}
            </span>
          ) : null}
        </p>
        <p className={styles.whenSecondary}>{timeLine}</p>
        <div className={styles.body}>
          <span>
            <strong>{row.visitorName}</strong> ·{' '}
            <a className={styles.email} href={`mailto:${row.visitorEmail}`}>
              {row.visitorEmail}
            </a>
          </span>
          <span>
            {mapsHref ? (
              <a className={styles.cafeLink} href={mapsHref} target="_blank" rel="noreferrer">
                {row.placeName} →
              </a>
            ) : (
              <strong>{row.placeName}</strong>
            )}
            <span className={styles.placeAddress}>{row.placeAddress}</span>
            {directionsHref ? (
              <a
                className={styles.directionsInline}
                href={directionsHref}
                target="_blank"
                rel="noreferrer"
              >
                {t('bookings.getDirections')} →
              </a>
            ) : null}
          </span>
          {row.visitorMessage ? (
            <span className={styles.visitorMessage}>
              <span className={styles.visitorMessageLabel}>{t('bookings.theirNote')}</span>
              {row.visitorMessage}
            </span>
          ) : null}
        </div>
      </div>
      {cancellable && !isCancelled ? (
        <div className={styles.actions}>
          {onReschedule ? (
            <button
              type="button"
              className={styles.rescheduleButton}
              onClick={onReschedule}
              disabled={cancelling}
            >
              {t('bookings.reschedule')}
            </button>
          ) : null}
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={cancelling}
          >
            {cancelling ? t('bookings.cancelling') : t('bookings.cancel')}
          </button>
        </div>
      ) : null}
    </li>
  );
}
