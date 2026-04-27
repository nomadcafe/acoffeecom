import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { useSession } from '../utils/authClient';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { AccountMenu } from './AccountMenu';
import { HeaderNavLinks } from './HeaderNavLinks';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SyncIndicator } from './SyncIndicator';
import accountStyles from './AccountPage.module.css';
import styles from './BookingsPage.module.css';

interface BookingWire {
  id: string;
  visitorName: string;
  visitorEmail: string;
  visitorAddress: string;
  scheduledAt: number;
  durationMinutes: number;
  placeId: string;
  placeName: string;
  placeAddress: string;
  placeLat: number;
  placeLng: number;
  status: 'pending' | 'cancelled';
  createdAt: number;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; bookings: BookingWire[] }
  | { kind: 'error' };

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
  const [tzMode, setTzMode] = useState<'home' | 'local'>('home');
  const effectiveTz = tzMode === 'home' ? homeTz : localTz;

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [cancelTarget, setCancelTarget] = useState<BookingWire | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const r = await fetch('/api/bookings', { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as { bookings: BookingWire[] };
      setState({ kind: 'ready', bookings: json.bookings });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    void refresh();
  }, [signedIn, refresh]);

  // ----- Loading skeleton (auth + initial fetch share this) -----
  if (isPending) {
    return (
      <div className={accountStyles.app}>
        <PageHeader homeHref={homeHref} />
        <main className={accountStyles.main} aria-busy="true">
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
      <div className={accountStyles.app}>
        <PageHeader homeHref={homeHref} />
        <main className={accountStyles.main}>
          <div className={accountStyles.signedOut}>
            <p>{t('bookings.signInRequired')}</p>
            <a className={accountStyles.signedOutCta} href={homeHref}>
              {t('bookings.goHome')}
            </a>
          </div>
        </main>
      </div>
    );
  }

  // ----- Signed in: render list -----
  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const r = await fetch(`/api/bookings/${encodeURIComponent(cancelTarget.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setCancelTarget(null);
      await refresh();
    } catch {
      setCancelError(t('bookings.cancelFailed'));
    } finally {
      setCancelling(false);
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
          <BookingsList
            rows={state.bookings}
            onCancelClick={setCancelTarget}
            cancellingId={cancelling ? cancelTarget?.id ?? null : null}
            cancelError={cancelError}
            locale={locale}
            timezone={effectiveTz}
            t={t}
          />
        )}
      </main>

      {cancelTarget ? (
        <CancelConfirmModal
          target={cancelTarget}
          locale={locale}
          timezone={effectiveTz}
          busy={cancelling}
          onClose={() => {
            if (!cancelling) {
              setCancelTarget(null);
              setCancelError(null);
            }
          }}
          onConfirm={() => void confirmCancel()}
          t={t}
        />
      ) : null}
    </div>
  );
}

interface CancelModalProps {
  target: BookingWire;
  locale: string;
  timezone: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  t: ReturnType<typeof useI18n>['t'];
}

function CancelConfirmModal({
  target,
  locale,
  timezone,
  busy,
  onClose,
  onConfirm,
  t,
}: CancelModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
      aria-labelledby="cancel-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modalDialog}>
        <h3 id="cancel-modal-title" className={styles.modalTitle}>
          {t('bookings.cancelModalTitle')}
        </h3>
        <p className={styles.modalBody}>{t('bookings.confirmCancel')}</p>
        <div className={styles.modalSummary}>
          <strong>{target.visitorName}</strong> · {when}
          <br />
          {target.placeName}
        </div>
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
            {busy ? t('bookings.cancelling') : t('bookings.cancelModalConfirm')}
          </button>
        </div>
      </div>
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

interface ListProps {
  rows: BookingWire[];
  onCancelClick: (row: BookingWire) => void;
  cancellingId: string | null;
  cancelError: string | null;
  locale: string;
  timezone: string;
  t: ReturnType<typeof useI18n>['t'];
}

function BookingsList({
  rows,
  onCancelClick,
  cancellingId,
  cancelError,
  locale,
  timezone,
  t,
}: ListProps) {
  // The "is this in the past?" cut is a render-time check; if the user leaves
  // the page open across a slot start the row will still appear under
  // "Upcoming" until the next data refresh, which is fine for our purposes.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const upcoming = rows.filter((r) => r.status === 'pending' && r.scheduledAt > now);
  const archived = rows
    .filter((r) => r.status === 'cancelled' || r.scheduledAt <= now)
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
        {cancelError ? (
          <p className={accountStyles.errorMsg} role="alert">
            {cancelError}
          </p>
        ) : null}
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
}

function BookingRow({
  row,
  locale,
  timezone,
  t,
  cancellable,
  cancelling,
  onCancel,
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

  return (
    <li className={cls}>
      <div>
        <p className={styles.when}>
          {dateLine}
          {isCancelled ? <span className={styles.statusPill}>{t('bookings.statusCancelled')}</span> : null}
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
            <span style={{ color: '#7a6a60', marginLeft: '0.4em' }}>{row.placeAddress}</span>
          </span>
        </div>
      </div>
      {cancellable && !isCancelled ? (
        <div className={styles.actions}>
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
