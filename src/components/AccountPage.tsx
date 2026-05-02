import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { authClient, useSession } from '../utils/authClient';
import { usePassportStats } from '../hooks/usePassportStats';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { PASSPORT_PATH } from '../routes';
import { formatAbsoluteDate } from '../utils/relativeTime';
import { track } from '../utils/analytics';
import { AccountMenu } from './AccountMenu';
import { HeaderNavLinks } from './HeaderNavLinks';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SyncIndicator } from './SyncIndicator';
import { useCafeAutocomplete } from '../hooks/useCafeAutocomplete';
import styles from './AccountPage.module.css';

const USERNAME_REGEX = /^[a-z][a-z0-9_-]{3,29}$/;
const CHECK_DEBOUNCE_MS = 350;
const DELETE_CONFIRM_PHRASE = 'DELETE';

/* Username picker is now open to everyone — Sprint E shipped public
 * cafe-owner profiles (acoffee.com/<slug>) and gating the slug picker
 * keeps the most-motivated users out. "Reserve good names for Pro" can
 * be revisited later via a small block-list rather than a feature flag. */
const USERNAMES_PUBLIC = true;
/** Default time a green success banner sticks before fading on its own.
 *  Long enough to read, short enough that it doesn't haunt the screen
 *  through the next interaction. Used by useAutoDismissOk below. */
const STATUS_OK_AUTO_DISMISS_MS = 4000;

type StatusBanner = { kind: 'ok' | 'err'; message: string } | null;

/**
 * Drop a `kind:'ok'` status banner after a short delay. Centralised so
 * the AccountPage cards (avatar, basic profile, social links, featured
 * cafés, booking, calendar) all share one auto-dismiss policy instead of
 * each card leaving its "Saved" message stuck on screen forever.
 *
 * Errors do NOT auto-dismiss — those usually need a user retry, so we
 * keep the banner visible until the user acts.
 */
function useAutoDismissOk(
  status: StatusBanner,
  setStatus: (s: StatusBanner) => void,
  ms: number = STATUS_OK_AUTO_DISMISS_MS,
): void {
  useEffect(() => {
    if (status?.kind !== 'ok') return;
    const id = window.setTimeout(() => setStatus(null), ms);
    return () => window.clearTimeout(id);
  }, [status, setStatus, ms]);
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; value: string | null }
  | { kind: 'error'; message: string };

type AvailabilityState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'unavailable'; reason: 'invalid' | 'reserved' | 'taken' };

interface SessionRow {
  id: string;
  device: string;
  ipAddress: string | null;
  createdAt: number;
  current: boolean;
}

type SessionsState =
  | { kind: 'loading' }
  | { kind: 'ready'; sessions: SessionRow[] }
  | { kind: 'error' };

export function AccountPage() {
  const { t, locale } = useI18n();
  const { visitedShops } = useApp();
  const { data: session, isPending, refetch: refetchSession } = useSession();
  const stats = usePassportStats(visitedShops);
  const homeHref = buildLocalizedPathname('/', locale);
  const passportHref = buildLocalizedPathname(PASSPORT_PATH, locale);

  // Better Auth additionalFields → username sits on session.user.
  const sessionUser = session?.user as
    | { email?: string; createdAt?: string | Date; username?: string | null }
    | undefined;
  const initialUsername = sessionUser?.username ?? '';

  const [draft, setDraft] = useState<string>(initialUsername);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [availability, setAvailability] = useState<AvailabilityState>({ kind: 'idle' });
  // Username "Saved" toast auto-fades — same policy as the per-card
  // status banners. Errors stay until the user types again.
  useEffect(() => {
    if (save.kind !== 'saved') return;
    const id = window.setTimeout(
      () => setSave({ kind: 'idle' }),
      STATUS_OK_AUTO_DISMISS_MS,
    );
    return () => window.clearTimeout(id);
  }, [save]);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // ----- Loading skeleton -----
  if (isPending) {
    return (
      <div className={styles.app}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <a className={styles.logo} href={homeHref} aria-label={t('app.logoAlt')}>
              <span className={styles.logoWordmark}>ACoffee</span>
            </a>
            <HeaderNavLinks />
            <div className={styles.headerAside}>
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
        <main className={styles.main} aria-busy="true">
          <div className={styles.hero}>
            <div className={`${styles.skeletonRow} ${styles.skeletonRowMed}`} />
            <div
              className={`${styles.skeletonRow} ${styles.skeletonRowShort}`}
              style={{ marginTop: '0.5rem' }}
            />
          </div>
          {[0, 1, 2].map((i) => (
            <section key={i} className={styles.card}>
              <div className={`${styles.skeletonRow} ${styles.skeletonRowShort}`} />
              <div className={styles.skeletonRow} style={{ marginTop: '0.6rem' }} />
              <div
                className={`${styles.skeletonRow} ${styles.skeletonRowMed}`}
                style={{ marginTop: '0.4rem' }}
              />
            </section>
          ))}
        </main>
      </div>
    );
  }

  // ----- Signed out -----
  if (!sessionUser?.email) {
    return (
      <div className={styles.app}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <a className={styles.logo} href={homeHref} aria-label={t('app.logoAlt')}>
              <span className={styles.logoWordmark}>ACoffee</span>
            </a>
            <HeaderNavLinks />
            <div className={styles.headerAside}>
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
        <main className={styles.main}>
          <div className={styles.signedOut}>
            <p>{t('account.signInRequired')}</p>
            <a className={styles.signedOutCta} href={homeHref}>
              {t('account.goHome')}
            </a>
          </div>
        </main>
      </div>
    );
  }

  // ----- Signed in -----
  return (
    <SignedInAccountPage
      draft={draft}
      setDraft={setDraft}
      save={save}
      setSave={setSave}
      availability={availability}
      setAvailability={setAvailability}
      deleteOpen={deleteOpen}
      setDeleteOpen={setDeleteOpen}
      sessionUser={sessionUser}
      initialUsername={initialUsername}
      stats={stats}
      passportHref={passportHref}
      homeHref={homeHref}
      onRefetchSession={() => void refetchSession?.()}
    />
  );
}

/**
 * Body extracted as a child component so we can use hooks (debounce effect)
 * unconditionally — the loading/signed-out branches above return early before
 * any hooks that would otherwise need to live below them.
 */
interface SignedInProps {
  draft: string;
  setDraft: (v: string) => void;
  save: SaveState;
  setSave: (s: SaveState) => void;
  availability: AvailabilityState;
  setAvailability: (s: AvailabilityState) => void;
  deleteOpen: boolean;
  setDeleteOpen: (v: boolean) => void;
  sessionUser: {
    email?: string;
    createdAt?: string | Date;
    username?: string | null;
    profilePublic?: boolean;
    monthlyRecapEmail?: boolean;
    displayName?: string | null;
    bio?: string | null;
    socialLinks?: string;
    homeBaseAddress?: string | null;
    availabilitySlots?: string;
    busyCalendarIcsUrl?: string | null;
    busyCalendarSyncedAt?: string | Date | number | null;
    busyCalendarLastError?: string | null;
    busyCalendarLastErrorAt?: string | Date | number | null;
  };
  initialUsername: string;
  stats: ReturnType<typeof usePassportStats>;
  passportHref: string;
  homeHref: string;
  onRefetchSession: () => void;
}

function SignedInAccountPage({
  draft,
  setDraft,
  save,
  setSave,
  availability,
  setAvailability,
  deleteOpen,
  setDeleteOpen,
  sessionUser,
  initialUsername,
  stats,
  passportHref,
  homeHref,
  onRefetchSession,
}: SignedInProps) {
  const { t, locale } = useI18n();
  const { visitedShops, starredShops } = useApp();
  const [sessionsState, setSessionsState] = useState<SessionsState>({ kind: 'loading' });
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  // Ref for the slug input so the home-page CTA's `?focus=username`
  // landing can scroll it into view and put the cursor in it on first
  // paint. Mount-time effect below consumes this.
  const usernameInputRef = useRef<HTMLInputElement>(null);

  // Honour `?focus=username` from the home profile-slide CTA callback URL:
  // scroll the slug card into view, focus the input, then strip the param
  // so a page refresh / share doesn't re-trigger the auto-focus. Runs once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('focus') !== 'username') return;
    // Wait a frame so the lazy AccountPage has had a chance to render the
    // username card before we try to scroll/focus it.
    const id = window.requestAnimationFrame(() => {
      const el = usernameInputRef.current;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus({ preventScroll: true });
      }
    });
    params.delete('focus');
    const nextSearch = params.toString();
    const target = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', target);
    return () => window.cancelAnimationFrame(id);
  }, []);

  const trimmed = draft.trim().toLowerCase();
  const cleared = trimmed === '';
  const sameAsCurrent = trimmed === (initialUsername ?? '').toLowerCase();
  const validFormat = cleared || USERNAME_REGEX.test(trimmed);

  // Debounced live availability check. Skip when cleared or unchanged so we
  // don't ping the server for "current name still available".
  useEffect(() => {
    if (cleared || sameAsCurrent) {
      setAvailability({ kind: 'idle' });
      return;
    }
    if (!validFormat) {
      setAvailability({ kind: 'unavailable', reason: 'invalid' });
      return;
    }
    setAvailability({ kind: 'checking' });
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/account/username?value=${encodeURIComponent(trimmed)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) {
          setAvailability({ kind: 'idle' });
          return;
        }
        const json = (await res.json()) as
          | { available: true }
          | { available: false; reason: 'invalid' | 'reserved' | 'taken' };
        setAvailability(
          json.available ? { kind: 'available' } : { kind: 'unavailable', reason: json.reason },
        );
      } catch {
        // network/abort — leave indicator quiet, server will re-validate on submit
        setAvailability({ kind: 'idle' });
      }
    }, CHECK_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [trimmed, validFormat, cleared, sameAsCurrent, setAvailability]);

  const canSubmit =
    save.kind !== 'saving' &&
    !sameAsCurrent &&
    (cleared || availability.kind === 'available');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSave({ kind: 'saving' });
    try {
      const res = await fetch('/api/account/username', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: cleared ? null : trimmed }),
      });
      if (!res.ok) {
        let message = t('account.usernameSaveFailed');
        let body: { error?: string; reason?: string } = {};
        try {
          body = (await res.json()) as { error?: string; reason?: string };
        } catch {
          /* ignore */
        }
        if (res.status === 409) message = t('account.usernameTaken');
        else if (res.status === 400) {
          // Reserved names get a softer "contact us" message; anything
          // else 400 is a format/validation problem.
          message = body.reason === 'reserved'
            ? t('account.usernameReserved')
            : t('account.usernameInvalid');
        } else if (body.error) {
          message = body.error;
        }
        setSave({ kind: 'error', message });
        return;
      }
      const j = (await res.json()) as { username: string | null };
      track('username_set', { hasName: j.username != null });
      setSave({ kind: 'saved', value: j.username });
      onRefetchSession();
    } catch (err) {
      setSave({
        kind: 'error',
        message: err instanceof Error ? err.message : t('account.usernameSaveFailed'),
      });
    }
  }

  async function handleSignOut() {
    // Always navigate home, even if signOut throws — keeps the user from
    // being stranded on a logged-in-only page when a network blip causes
    // the request to fail. Server cookie may persist a bit longer; the
    // home page's session check will clean that up on next interaction.
    try {
      await authClient.signOut();
    } catch {
      /* ignore — navigate anyway */
    }
    window.location.href = homeHref;
  }

  // Fetch active sessions on mount. Re-fetched after a successful revoke so
  // the list stays accurate without a separate refresh button.
  const refreshSessions = async () => {
    try {
      const res = await fetch('/api/account/sessions');
      if (!res.ok) {
        setSessionsState({ kind: 'error' });
        return;
      }
      const json = (await res.json()) as { sessions: SessionRow[] };
      setSessionsState({ kind: 'ready', sessions: json.sessions });
    } catch {
      setSessionsState({ kind: 'error' });
    }
  };
  useEffect(() => {
    void refreshSessions();
  }, []);

  async function handleRevokeSession(s: SessionRow) {
    if (revokingId) return;
    // Revoking the *current* session signs the user out — that's a real
    // surprise if they tapped Revoke while scanning the device list. Gate
    // it with a native confirm dialog (sufficient for low-frequency
    // destructive ops; building a custom modal here just to ask "are you
    // sure" feels disproportionate). Other-device revokes don't sign the
    // user out, so they don't need a confirm.
    if (s.current) {
      const ok = window.confirm(t('account.sessionsRevokeConfirm'));
      if (!ok) return;
    }
    setRevokeError(null);
    setRevokingId(s.id);
    try {
      const res = await fetch(`/api/account/sessions/${encodeURIComponent(s.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        // Failure path used to silently no-op; user clicks Revoke and
        // nothing happens, no clue why. Surface a banner so they know
        // to retry instead of staring at an unchanged list.
        setRevokeError(t('account.sessionsRevokeFailed'));
        return;
      }
      track('session_revoked', { wasCurrent: s.current });
      if (s.current) {
        // Revoking ourselves — clear cookie + bounce home.
        await authClient.signOut().catch(() => undefined);
        window.location.href = homeHref;
        return;
      }
      await refreshSessions();
    } catch {
      setRevokeError(t('account.sessionsRevokeFailed'));
    } finally {
      setRevokingId(null);
    }
  }

  function handleExportAll() {
    setExportError(null);
    let url: string | null = null;
    let anchor: HTMLAnchorElement | null = null;
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        version: 1,
        account: {
          email: sessionUser.email,
          createdAt: sessionUser.createdAt ?? null,
          username: sessionUser.username ?? null,
        },
        visited: visitedShops,
        starred: starredShops,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      url = URL.createObjectURL(blob);
      anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `acoffee-account-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      track('account_data_exported', {
        shopCount: visitedShops.length,
        starredCount: starredShops.length,
      });
    } catch {
      // Browser denied download / blob alloc failed / JSON.stringify
      // hit a circular shape — anything in this path used to silently
      // do nothing. Make the failure visible instead.
      setExportError(t('account.exportFailed'));
    } finally {
      if (anchor && anchor.parentNode) anchor.parentNode.removeChild(anchor);
      if (url) URL.revokeObjectURL(url);
    }
  }

  const createdAtRaw = sessionUser.createdAt;
  const createdAt = createdAtRaw
    ? typeof createdAtRaw === 'string'
      ? new Date(createdAtRaw).getTime()
      : createdAtRaw.getTime()
    : null;

  // Show the public link based on the just-saved value first, falling back to
  // the session's persisted value — covers the "saved seconds ago, session
  // refetch hasn't returned yet" gap.
  const effectiveUsername =
    save.kind === 'saved' ? save.value : (sessionUser.username ?? null);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.logo} href={homeHref} aria-label={t('app.logoAlt')}>
            <span className={styles.logoWordmark}>ACoffee</span>
          </a>
          <HeaderNavLinks />
          <div className={styles.headerAside}>
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

      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.pageTitle}>{t('account.title')}</h1>
          <p className={styles.lead}>{t('account.lead')}</p>
        </div>

        <div className={styles.layout}>
          <AccountToc />
          <div className={styles.content}>

        <section id="account-identity" className={styles.card} aria-label={t('account.identityTitle')}>
          <h2 className={styles.cardTitle}>{t('account.identityTitle')}</h2>
          <div className={styles.identityRow}>
            <span className={styles.identityKey}>{t('account.email')}</span>
            <span className={styles.identityValue}>{sessionUser.email}</span>
          </div>
          {createdAt != null ? (
            <div className={styles.identityRow}>
              <span className={styles.identityKey}>{t('account.memberSince')}</span>
              <span className={styles.identityValue}>{formatAbsoluteDate(createdAt, locale)}</span>
            </div>
          ) : null}
        </section>

        {USERNAMES_PUBLIC ? (
          <section id="account-username" className={styles.card} aria-label={t('account.usernameTitle')}>
            <h2 className={styles.cardTitle}>{t('account.usernameTitle')}</h2>
            <form className={styles.usernameForm} onSubmit={handleSubmit}>
              <div className={styles.usernamePrefix}>
                <span className={styles.usernamePrefixLabel}>acoffee.com/</span>
                <input
                  ref={usernameInputRef}
                  className={styles.usernameInput}
                  type="text"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={t('account.usernamePlaceholder')}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (save.kind !== 'idle') setSave({ kind: 'idle' });
                  }}
                  aria-invalid={availability.kind === 'unavailable' || undefined}
                  aria-describedby="username-hint username-availability"
                />
              </div>

              <p
                id="username-availability"
                className={styles.availability}
                aria-live="polite"
                role="status"
              >
                {renderAvailability(availability, t)}
              </p>

              <p className={styles.usernameHint} id="username-hint">
                {t('account.usernameHint')}
              </p>

              <div className={styles.formRow}>
                <button type="submit" className={styles.saveButton} disabled={!canSubmit}>
                  {save.kind === 'saving'
                    ? t('account.saving')
                    : cleared
                      ? t('account.clearUsername')
                      : t('account.saveUsername')}
                </button>
                {save.kind === 'error' ? (
                  <p className={styles.errorMsg} role="alert">{save.message}</p>
                ) : null}
                {save.kind === 'saved' ? (
                  <p className={styles.successMsg} role="status">
                    {save.value
                      ? t('account.usernameSaved', { username: save.value })
                      : t('account.usernameCleared')}
                  </p>
                ) : null}
              </div>

              {effectiveUsername ? (
                <div className={styles.publicLink}>
                  <span aria-hidden>🔗</span>
                  <span>
                    {t('account.publicLink')}{' '}
                    <span className={styles.publicLinkUrl}>
                      acoffee.com/{effectiveUsername}
                    </span>
                  </span>
                </div>
              ) : null}
            </form>
          </section>
        ) : (
          /* Tease the future Pro feature without exposing the picker. */
          <section id="account-username" className={styles.card} aria-label={t('account.usernameTitle')}>
            <h2 className={styles.cardTitle}>{t('account.usernameTitle')}</h2>
            <p className={styles.usernameHint} style={{ marginTop: 0 }}>
              {t('account.usernameProSoon')}
            </p>
            {effectiveUsername ? (
              <div className={styles.publicLink}>
                <span aria-hidden>🔗</span>
                <span>
                  {t('account.publicLink')}{' '}
                  <span className={styles.publicLinkUrl}>
                    acoffee.com/{effectiveUsername}
                  </span>
                </span>
              </div>
            ) : null}
          </section>
        )}

        <ProfileVisibilityCard
          hasUsername={!!effectiveUsername}
          username={effectiveUsername}
          initial={
            (sessionUser as { profilePublic?: boolean }).profilePublic === true
          }
        />

        <AvatarCard initialImage={(sessionUser as { image?: string | null }).image ?? null} />

        <BasicProfileCard
          initialDisplayName={
            (sessionUser as { displayName?: string | null }).displayName ?? ''
          }
          initialBio={(sessionUser as { bio?: string | null }).bio ?? ''}
        />

        <SocialLinksCard
          initialSocialLinks={parseInitialSocialLinks(
            (sessionUser as { socialLinks?: string }).socialLinks,
          )}
          initialShowSocialLinks={
            (sessionUser as { showSocialLinks?: boolean }).showSocialLinks !== false
          }
        />

        <FeaturedCafesCard />

        <BookingSetupCard
          initialAddress={
            (sessionUser as { homeBaseAddress?: string | null }).homeBaseAddress ?? ''
          }
          initialAvailability={parseInitialAvailability(
            (sessionUser as { availabilitySlots?: string }).availabilitySlots,
          )}
          username={sessionUser.username ?? ''}
          profilePublic={!!sessionUser.profilePublic}
        />

        <CalendarSyncCard
          initialUrl={sessionUser.busyCalendarIcsUrl ?? ''}
          initialSyncedAt={msFromMaybe(sessionUser.busyCalendarSyncedAt)}
          initialLastError={sessionUser.busyCalendarLastError ?? null}
          initialLastErrorAt={msFromMaybe(sessionUser.busyCalendarLastErrorAt)}
        />

        <MonthlyRecapCard
          initial={
            (sessionUser as { monthlyRecapEmail?: boolean }).monthlyRecapEmail !== false
          }
        />

        <section id="account-stats" className={styles.card} aria-label={t('account.statsTitle')}>
          <h2 className={styles.cardTitle}>{t('account.statsTitle')}</h2>
          <div className={styles.statsRow}>
            <a href={passportHref} className={`${styles.statCell} ${styles.statCellLink}`}>
              <div className={styles.statCellValue}>{stats.shops}</div>
              <div className={styles.statCellLabel}>{t('passport.statShops')}</div>
            </a>
            <a href={passportHref} className={`${styles.statCell} ${styles.statCellLink}`}>
              <div className={styles.statCellValue}>{stats.total}</div>
              <div className={styles.statCellLabel}>{t('passport.statVisits')}</div>
            </a>
            <a href={passportHref} className={`${styles.statCell} ${styles.statCellLink}`}>
              <div className={styles.statCellValue}>{stats.streak}</div>
              <div className={styles.statCellLabel}>{t('passport.statStreak')}</div>
            </a>
          </div>
        </section>

        <section id="account-export" className={styles.card} aria-label={t('account.exportTitle')}>
          <h2 className={styles.cardTitle}>{t('account.exportTitle')}</h2>
          <p className={styles.dangerHint} style={{ color: 'var(--ac-text-muted)' }}>
            {t('account.exportHint')}
          </p>
          <button type="button" className={styles.saveButton} onClick={handleExportAll}>
            {t('account.exportButton')}
          </button>
          {exportError ? (
            <p className={styles.sessionsRevokeError} role="alert">
              {exportError}
            </p>
          ) : null}
        </section>

        <section id="account-sessions" className={styles.card} aria-label={t('account.sessionsTitle')}>
          <h2 className={styles.cardTitle}>{t('account.sessionsTitle')}</h2>
          {sessionsState.kind === 'loading' ? (
            <p className={styles.sessionLoading}>{t('account.sessionsLoading')}</p>
          ) : sessionsState.kind === 'error' ? (
            <div className={styles.sessionsErrorBlock} role="alert">
              <p className={styles.sessionsErrorText}>{t('account.sessionsError')}</p>
              <button
                type="button"
                className={styles.sessionsErrorRetry}
                onClick={() => {
                  setSessionsState({ kind: 'loading' });
                  void refreshSessions();
                }}
              >
                {t('errors.retry')}
              </button>
            </div>
          ) : sessionsState.sessions.length === 0 ? (
            <p className={styles.sessionEmpty}>{t('account.sessionsEmpty')}</p>
          ) : (
            <ul className={styles.sessionList}>
              {sessionsState.sessions.map((s) => (
                <li key={s.id} className={styles.sessionRow}>
                  <div className={styles.sessionMain}>
                    <div className={styles.sessionDevice}>
                      {s.device}
                      {s.current ? (
                        <span className={styles.sessionCurrent}>
                          {t('account.sessionsCurrent')}
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.sessionMeta}>
                      {formatAbsoluteDate(s.createdAt, locale)}
                      {s.ipAddress ? <> · {s.ipAddress}</> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.sessionRevoke}
                    onClick={() => void handleRevokeSession(s)}
                    disabled={revokingId != null}
                    aria-label={t('account.sessionsRevokeAria', { device: s.device })}
                  >
                    {revokingId === s.id
                      ? t('account.sessionsRevoking')
                      : t('account.sessionsRevoke')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {revokeError ? (
            <p className={styles.sessionsRevokeError} role="alert">
              {revokeError}
            </p>
          ) : null}
        </section>

        <section className={`${styles.card} ${styles.signOutCard}`}>
          <h2 className={styles.cardTitle}>{t('account.session')}</h2>
          <button type="button" className={styles.signOutButton} onClick={() => void handleSignOut()}>
            {t('auth.signOut')}
          </button>
        </section>

        <section
          id="account-danger"
          className={`${styles.card} ${styles.dangerCard}`}
          aria-label={t('account.deleteTitle')}
        >
          <h2 className={styles.cardTitle}>{t('account.deleteTitle')}</h2>
          <p className={styles.dangerHint}>{t('account.deleteHint')}</p>
          <button
            type="button"
            className={styles.dangerButton}
            onClick={() => setDeleteOpen(true)}
          >
            {t('account.deleteButton')}
          </button>
        </section>
          </div>
        </div>
      </main>

      {deleteOpen ? (
        <DeleteAccountModal
          onClose={() => setDeleteOpen(false)}
          onConfirmed={() => {
            // After deletion the session is gone server-side; clear client state too.
            void authClient.signOut().finally(() => {
              window.location.href = homeHref;
            });
          }}
        />
      ) : null}
    </div>
  );
}

function renderAvailability(state: AvailabilityState, t: (k: string) => string) {
  switch (state.kind) {
    case 'idle':
      return <>&nbsp;</>; // reserve vertical space so layout doesn't jump
    case 'checking':
      return (
        <span className={styles.availabilityChecking}>{t('account.usernameChecking')}</span>
      );
    case 'available':
      return (
        <span className={styles.availabilityOk}>
          <span className={styles.availabilityIcon} aria-hidden>✓</span>
          {t('account.usernameAvailable')}
        </span>
      );
    case 'unavailable': {
      const key =
        state.reason === 'taken'
          ? 'account.usernameTaken'
          : state.reason === 'reserved'
            ? 'account.usernameReserved'
            : 'account.usernameInvalid';
      return (
        <span className={styles.availabilityFail}>
          <span className={styles.availabilityIcon} aria-hidden>✕</span>
          {t(key)}
        </span>
      );
    }
  }
}

interface DeleteModalProps {
  onClose: () => void;
  onConfirmed: () => void;
}

function DeleteAccountModal({ onClose, onConfirmed }: DeleteModalProps) {
  const { t } = useI18n();
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus management: focus the input on mount; cycle Tab inside the
  // dialog (don't let it escape to underlying page buttons — that
  // would let the user activate "Delete account again" via the Tab
  // key while the modal claims to be modal); allow Escape to close.
  useEffect(() => {
    inputRef.current?.focus();
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

  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account', { method: 'DELETE' });
      if (!res.ok) {
        setError(t('account.deleteFailed'));
        setBusy(false);
        return;
      }
      track('account_deleted');
      onConfirmed();
    } catch {
      setError(t('account.deleteFailed'));
      setBusy(false);
    }
  }

  const armed = phrase.trim().toUpperCase() === DELETE_CONFIRM_PHRASE && !busy;

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      onClick={(e) => {
        // Backdrop click closes only when the user hasn't started arming
        // the dialog. Once they've typed even a single character of the
        // confirm phrase, a stray tap on the dim area shouldn't drop the
        // dialog and lose their typing — they have to use Cancel/Escape.
        if (e.target === e.currentTarget && !busy && phrase.length === 0) {
          onClose();
        }
      }}
    >
      <div ref={dialogRef} className={styles.modalDialog}>
        <h3 id="delete-modal-title" className={styles.modalTitle}>
          {t('account.deleteConfirmTitle')}
        </h3>
        <p className={styles.modalBody}>
          {t('account.deleteConfirmBody', { phrase: DELETE_CONFIRM_PHRASE })}
        </p>
        <input
          ref={inputRef}
          className={styles.modalInput}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={DELETE_CONFIRM_PHRASE}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
          aria-label={t('account.deleteConfirmInputAria', { phrase: DELETE_CONFIRM_PHRASE })}
        />
        {error ? <p className={styles.errorMsg} role="alert">{error}</p> : null}
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.modalCancel}
            onClick={onClose}
            disabled={busy}
          >
            {t('account.deleteCancel')}
          </button>
          <button
            type="button"
            className={styles.modalConfirmDanger}
            onClick={() => void handleDelete()}
            disabled={!armed}
          >
            {busy ? t('account.deleting') : t('account.deleteConfirmCta')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface VisibilityProps {
  hasUsername: boolean;
  username: string | null;
  initial: boolean;
}

/**
 * Toggle for `acoffee.com/<username>` visibility. Only useful once the user
 * has a slug; before then the toggle is disabled. While the global username
 * picker is gated (USERNAMES_PUBLIC=false) effectively no one has a slug
 * yet, so the card mostly renders as a "soon" placeholder — but it'll start
 * working the moment the picker opens, no extra deploy needed.
 */

/**
 * Sidebar TOC for AccountPage on desktop (≥1024px). Lists every settings
 * section in render order; a click smooth-scrolls to the section, and an
 * IntersectionObserver-backed scroll spy highlights whichever section is
 * currently in view. Hidden via CSS below the breakpoint — mobile users
 * just scroll the page like they do today.
 *
 * The id list lives here (not in some shared module) because the rendering
 * site is the only consumer; if a card is added, both the JSX `id` and
 * this list need updating, and keeping them adjacent makes that obvious.
 */
const TOC_SECTIONS: ReadonlyArray<{ id: string; labelKey: string }> = [
  { id: 'account-identity', labelKey: 'account.identityTitle' },
  { id: 'account-username', labelKey: 'account.usernameTitle' },
  { id: 'account-visibility', labelKey: 'account.profileTitle' },
  { id: 'account-avatar', labelKey: 'account.avatarTitle' },
  { id: 'account-basic', labelKey: 'account.basicInfoTitle' },
  { id: 'account-social', labelKey: 'account.socialLinksTitle' },
  { id: 'account-cafes', labelKey: 'account.featuredCafeLabel' },
  { id: 'account-booking', labelKey: 'account.bookingTitle' },
  { id: 'account-calendar', labelKey: 'account.calendarTitle' },
  { id: 'account-recap', labelKey: 'account.recapTitle' },
  { id: 'account-stats', labelKey: 'account.statsTitle' },
  { id: 'account-export', labelKey: 'account.exportTitle' },
  { id: 'account-sessions', labelKey: 'account.sessionsTitle' },
  { id: 'account-danger', labelKey: 'account.deleteTitle' },
];

/** Watch each section id and report the topmost one currently in view.
 *  Falls back to the first id if nothing is intersecting (e.g. very long
 *  sections where no boundary is visible). */
function useScrollSpy(ids: ReadonlyArray<string>): string {
  const [activeId, setActiveId] = useState<string>(ids[0] ?? '');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    // rootMargin pushes the "active" zone down a bit so a section is
    // marked active once its title is past the sticky header, not when
    // its top edge first peeks in. Bottom is generous so we don't flicker
    // off-active while the next section is still mostly off-screen.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
        );
        setActiveId(topmost.target.id);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);
  return activeId;
}

function AccountToc() {
  const { t } = useI18n();
  const ids = TOC_SECTIONS.map((s) => s.id);
  const activeId = useScrollSpy(ids);
  return (
    <nav className={styles.toc} aria-label={t('account.tocAria')}>
      <ol className={styles.tocList}>
        {TOC_SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              className={`${styles.tocLink}${
                activeId === s.id ? ' ' + styles.tocLinkActive : ''
              }`}
              href={`#${s.id}`}
              onClick={(e) => {
                // Smooth-scroll without forcing a hash navigation that the
                // browser would jump-to abruptly. We set the hash via
                // replaceState so back/forward still hit the right anchor.
                const el = document.getElementById(s.id);
                if (el) {
                  e.preventDefault();
                  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  history.replaceState(null, '', `#${s.id}`);
                }
              }}
            >
              {t(s.labelKey)}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ProfileVisibilityCard({ hasUsername, username, initial }: VisibilityProps) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canToggle = hasUsername && !busy;

  async function handleToggle() {
    if (!canToggle) return;
    const next = !enabled;
    setEnabled(next); // optimistic — flip back on failure
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profilePublic: next }),
      });
      if (!res.ok) {
        setEnabled(!next);
        setError(t('account.profileSaveFailed'));
      } else {
        track('profile_visibility_set', { public: next });
      }
    } catch {
      setEnabled(!next);
      setError(t('account.profileSaveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-visibility" className={styles.card} aria-label={t('account.profileTitle')}>
      <h2 className={styles.cardTitle}>{t('account.profileTitle')}</h2>
      <div className={styles.toggleRow}>
        <label className={styles.toggleLabel} htmlFor="profile-visibility-toggle">
          {t('account.profileToggleLabel')}
          <span className={styles.toggleSubLabel}>
            {hasUsername
              ? enabled
                ? t('account.profilePublicHint', { username: username ?? '' })
                : t('account.profilePrivateHint')
              : t('account.profileNeedsUsername')}
          </span>
        </label>
        <button
          type="button"
          id="profile-visibility-toggle"
          className={`${styles.toggle}${enabled ? ' ' + styles.toggleOn : ''}`}
          role="switch"
          aria-checked={enabled}
          aria-label={t('account.profileToggleAria')}
          disabled={!canToggle}
          onClick={() => void handleToggle()}
        />
      </div>
      {error ? <p className={styles.errorMsg} role="alert">{error}</p> : null}
    </section>
  );
}

interface RecapToggleProps {
  initial: boolean;
}

/** Toggle for the monthly recap email. Optimistic flip; reverts on PATCH
 *  failure. Uses the same toggle styles + PATCH /api/account endpoint as
 *  the profile-visibility card. */
function MonthlyRecapCard({ initial }: RecapToggleProps) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<
    { kind: 'sent' | 'skipped' | 'error'; message: string } | null
  >(null);
  // Auto-fade non-error outcomes; "error" stays so the user can read it.
  useEffect(() => {
    if (!testStatus || testStatus.kind === 'error') return;
    const id = window.setTimeout(() => setTestStatus(null), STATUS_OK_AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [testStatus]);

  async function handleToggle() {
    if (busy) return;
    const next = !enabled;
    setEnabled(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ monthlyRecapEmail: next }),
      });
      if (!res.ok) {
        setEnabled(!next);
        setError(t('account.recapSaveFailed'));
      } else {
        track('monthly_recap_set', { enabled: next });
      }
    } catch {
      setEnabled(!next);
      setError(t('account.recapSaveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function handleSendTest() {
    if (testing) return;
    setTesting(true);
    setTestStatus(null);
    try {
      const res = await fetch('/api/account/recap-test', { method: 'POST' });
      if (!res.ok) {
        setTestStatus({ kind: 'error', message: t('account.recapTestFailed') });
        return;
      }
      const j = (await res.json()) as { outcome: 'sent' | 'skipped' | 'failed' };
      track('recap_test_sent', { outcome: j.outcome });
      if (j.outcome === 'sent') {
        setTestStatus({ kind: 'sent', message: t('account.recapTestSent') });
      } else if (j.outcome === 'skipped') {
        setTestStatus({ kind: 'skipped', message: t('account.recapTestSkipped') });
      } else {
        setTestStatus({ kind: 'error', message: t('account.recapTestFailed') });
      }
    } catch {
      setTestStatus({ kind: 'error', message: t('account.recapTestFailed') });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section id="account-recap" className={styles.card} aria-label={t('account.recapTitle')}>
      <h2 className={styles.cardTitle}>{t('account.recapTitle')}</h2>
      <div className={styles.toggleRow}>
        <label className={styles.toggleLabel} htmlFor="monthly-recap-toggle">
          {t('account.recapToggleLabel')}
          <span className={styles.toggleSubLabel}>
            {enabled ? t('account.recapOnHint') : t('account.recapOffHint')}
          </span>
        </label>
        <button
          type="button"
          id="monthly-recap-toggle"
          className={`${styles.toggle}${enabled ? ' ' + styles.toggleOn : ''}`}
          role="switch"
          aria-checked={enabled}
          aria-label={t('account.recapToggleAria')}
          disabled={busy}
          onClick={() => void handleToggle()}
        />
      </div>
      {error ? <p className={styles.errorMsg} role="alert">{error}</p> : null}
      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={() => void handleSendTest()}
          disabled={testing}
        >
          {testing ? t('account.recapTesting') : t('account.recapTestButton')}
        </button>
        {testStatus ? (
          <p
            className={
              testStatus.kind === 'error' ? styles.errorMsg : styles.successMsg
            }
            role="status"
          >
            {testStatus.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Held in form state. The `_key` is local — never sent to the server —
 * and gives React a stable identity per row so removing the first row
 * doesn't shift inputs from the second row into the first one's slot
 * (which keying by array index would do, with real data-loss potential
 * if the user is mid-typing in row 2 when they delete row 1).
 */
interface SocialLinkDraft {
  _key: string;
  label: string;
  url: string;
}

function freshKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseInitialSocialLinks(raw: string | undefined): SocialLinkDraft[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (l): l is { label: string; url: string } =>
          l && typeof l === 'object' && typeof l.label === 'string' && typeof l.url === 'string',
      )
      .slice(0, 5)
      .map((l) => ({ _key: freshKey(), label: l.label, url: l.url }));
  } catch {
    return [];
  }
}

type FeaturedCafeRelation = 'owned' | 'favorite';

/** Draft shape held in form state. Mirrors the request body sent on save
 *  plus server-computed `ownerVerified` (read-only here; refreshed by the
 *  GET round-trip after each save). `websiteUri` is captured from the
 *  picker so the server can re-run domain verification on save without
 *  another Places API call — never shown in the UI. */
interface FeaturedCafeDraft {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  relation: FeaturedCafeRelation;
  note: string;
  linkInstagram: string;
  linkWebsite: string;
  linkMenu: string;
  linkBookingExternal: string;
  ownerPinnedNote: string;
  websiteUri: string | null;
  ownerVerified: boolean;
}

const FEATURED_MAX = 5;
const FEATURED_NOTE_MAX = 140;
const FEATURED_PINNED_NOTE_MAX = 80;
const FEATURED_LINK_MAX = 200;

function emptyCafeFromPicked(
  picked: { placeId: string; name: string; address: string; lat: number; lng: number; websiteUri?: string | null },
  relation: FeaturedCafeRelation,
): FeaturedCafeDraft {
  return {
    placeId: picked.placeId,
    name: picked.name,
    address: picked.address,
    lat: picked.lat,
    lng: picked.lng,
    relation,
    note: '',
    linkInstagram: '',
    linkWebsite: '',
    linkMenu: '',
    linkBookingExternal: '',
    ownerPinnedNote: '',
    websiteUri: picked.websiteUri ?? null,
    ownerVerified: false,
  };
}

/* The Profile content section is split into three discrete cards
 * (Basic / Social links / Featured cafés) so each has its own scroll
 * anchor, save button, and error surface. Server-side /api/account PATCH
 * accepts each field independently, so the split is purely a client
 * concern — no API change needed. */
interface BasicProfileProps {
  initialDisplayName: string;
  initialBio: string;
}
interface SocialLinksProps {
  initialSocialLinks: SocialLinkDraft[];
  initialShowSocialLinks: boolean;
}

const AVATAR_MAX_DIMENSION = 512;
const AVATAR_WEBP_QUALITY = 0.85;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Resize + crop an image File to a square webp Blob no larger than
 * AVATAR_MAX_DIMENSION on either side. Center-crop to square so the
 * circular avatar mask doesn't slice off important content
 * unpredictably (left/right ear, etc.).
 *
 * Done client-side so the bytes that hit /api/account/avatar are
 * already tiny — saves R2 ingress + Workers CPU on resize, and means
 * a phone-sourced 8MB HEIC isn't bouncing off the 2MB server cap.
 *
 * Throws on decode failure (corrupt file, unsupported format) so the
 * caller can show a useful error rather than a silent retry.
 */
async function resizeAvatarToWebp(file: File): Promise<Blob> {
  // `imageOrientation: 'from-image'` honors the EXIF orientation tag —
  // without it, iPhone portraits decode to landscape and silently
  // upload sideways. Older browsers ignore the option (no harm).
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  });
  const min = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - min) / 2;
  const sy = (bitmap.height - min) / 2;
  const target = Math.min(AVATAR_MAX_DIMENSION, min);

  // Prefer OffscreenCanvas (worker-friendly, doesn't pin DOM); fall
  // back to a plain <canvas> element on older Safari that lacks it.
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(target, target);
    ctx = (canvas as OffscreenCanvas).getContext('2d');
  } else {
    canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;
    ctx = (canvas as HTMLCanvasElement).getContext('2d');
  }
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(bitmap, sx, sy, min, min, 0, 0, target, target);
  bitmap.close?.();

  if ('convertToBlob' in canvas) {
    return await canvas.convertToBlob({ type: 'image/webp', quality: AVATAR_WEBP_QUALITY });
  }
  // HTMLCanvasElement path — wrap toBlob in a promise.
  return await new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas toBlob returned null'))),
      'image/webp',
      AVATAR_WEBP_QUALITY,
    );
  });
}

/**
 * Avatar editor card. Shows the current image (Google OAuth-supplied
 * or user-uploaded), a file picker, and a remove button. The picker
 * resizes to 512x512 webp client-side before POSTing the raw bytes —
 * server-side validation is just type/size enforcement, no
 * server-side image processing required.
 */
function AvatarCard({ initialImage }: { initialImage: string | null }) {
  const { t } = useI18n();
  const [image, setImage] = useState<string | null>(initialImage);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusBanner>(null);
  useAutoDismissOk(status, setStatus);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Abort + unmount guard: avatar uploads are slow on cellular, the
  // user can navigate away mid-flight. Without these, fetch resolves
  // on a dead component and React warns; the upload itself also can't
  // be cancelled, so we'd be uploading bytes the user no longer cares
  // about.
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  async function handleFile(file: File) {
    if (busy) return;
    setStatus(null);
    if (!file.type.startsWith('image/')) {
      setStatus({ kind: 'err', message: t('account.avatarBadType') });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES * 4) {
      // Pre-resize cap — even after resize a >8MB original is suspicious
      // (8K photo, RAW, etc) and not worth the CPU spike.
      setStatus({ kind: 'err', message: t('account.avatarTooLarge') });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      const webp = await resizeAvatarToWebp(file);
      if (controller.signal.aborted || !mountedRef.current) return;
      if (webp.size > AVATAR_MAX_BYTES) {
        setStatus({ kind: 'err', message: t('account.avatarTooLarge') });
        return;
      }
      const res = await fetch('/api/account/avatar', {
        method: 'POST',
        headers: { 'content-type': 'image/webp' },
        body: webp,
        signal: controller.signal,
      });
      if (controller.signal.aborted || !mountedRef.current) return;
      if (!res.ok) {
        setStatus({ kind: 'err', message: t('account.avatarUploadFailed') });
        return;
      }
      const data = (await res.json()) as { image?: string };
      if (controller.signal.aborted || !mountedRef.current) return;
      if (data.image) setImage(data.image);
      setStatus({ kind: 'ok', message: t('account.avatarUploaded') });
      track('avatar_uploaded', { sizeKB: Math.round(webp.size / 1024) });
    } catch (e) {
      if (controller.signal.aborted || !mountedRef.current) return;
      // AbortError raised on user-driven cancel is silent; everything
      // else (decode failure, network error) becomes a visible error.
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setStatus({ kind: 'err', message: t('account.avatarDecodeFailed') });
    } finally {
      if (mountedRef.current) setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function handleRemove() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/account/avatar', { method: 'DELETE' });
      if (!res.ok) {
        setStatus({ kind: 'err', message: t('account.avatarRemoveFailed') });
        return;
      }
      setImage(null);
      setStatus({ kind: 'ok', message: t('account.avatarRemoved') });
      track('avatar_removed', {});
    } catch {
      setStatus({ kind: 'err', message: t('account.avatarRemoveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-avatar" className={styles.card} aria-label={t('account.avatarTitle')}>
      <h2 className={styles.cardTitle}>{t('account.avatarTitle')}</h2>
      <p className={styles.usernameHint} style={{ marginTop: 0 }}>
        {t('account.avatarHint')}
      </p>
      <div className={styles.avatarRow}>
        {image ? (
          <img className={styles.avatarPreview} src={image} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className={styles.avatarPreviewEmpty} aria-hidden>
            ☕
          </div>
        )}
        <div className={styles.avatarActions}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
            disabled={busy}
          />
          {image ? (
            <button
              type="button"
              className={styles.linkRemove}
              onClick={() => void handleRemove()}
              disabled={busy}
              aria-label={t('account.avatarRemoveAria')}
            >
              {t('account.avatarRemove')}
            </button>
          ) : null}
        </div>
      </div>
      {status ? (
        <p
          className={status.kind === 'err' ? styles.errorMsg : styles.successMsg}
          role="status"
          style={{ marginTop: 8 }}
        >
          {status.message}
        </p>
      ) : null}
    </section>
  );
}

const DISPLAY_NAME_MAX = 50;
const BIO_MAX = 160;
const LINKS_MAX = 5;
const LINK_LABEL_MAX = 30;
const LINK_URL_MAX = 200;

/**
 * Bio-link editor: display name + one-line bio + up to 5 social links. All
 * three fields are PATCHed together on Save so the form has one obvious
 * commit moment instead of save-on-every-blur churn (a half-typed URL
 * shouldn't be persisted as the user navigates between rows).
 */
function BasicProfileCard({ initialDisplayName, initialBio }: BasicProfileProps) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusBanner>(null);
  useAutoDismissOk(status, setStatus);

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() ? displayName.trim() : null,
          bio: bio.trim() ? bio.trim() : null,
        }),
      });
      if (!res.ok) {
        setStatus({ kind: 'err', message: t('account.profileContentSaveFailed') });
        return;
      }
      setStatus({ kind: 'ok', message: t('account.profileContentSaved') });
      track('profile_basic_set', { hasName: !!displayName.trim(), hasBio: !!bio.trim() });
    } catch {
      setStatus({ kind: 'err', message: t('account.profileContentSaveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-basic" className={styles.card} aria-label={t('account.basicInfoTitle')}>
      <h2 className={styles.cardTitle}>{t('account.basicInfoTitle')}</h2>
      <p className={styles.usernameHint} style={{ marginTop: 0 }}>
        {t('account.basicInfoHint')}
      </p>

      <label className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>{t('account.displayNameLabel')}</span>
        <input
          type="text"
          className={styles.usernameInput}
          maxLength={DISPLAY_NAME_MAX}
          placeholder={t('account.displayNamePlaceholder')}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <span className={styles.charCount}>
          {displayName.length} / {DISPLAY_NAME_MAX}
        </span>
      </label>

      <label className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>{t('account.bioLabel')}</span>
        <textarea
          className={styles.bioTextarea}
          maxLength={BIO_MAX}
          rows={3}
          placeholder={t('account.bioPlaceholder')}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
        <span className={styles.charCount}>
          {bio.length} / {BIO_MAX}
        </span>
      </label>

      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={() => void handleSave()}
          disabled={busy}
        >
          {busy ? t('account.saving') : t('account.profileContentSave')}
        </button>
        {status ? (
          <p
            className={status.kind === 'err' ? styles.errorMsg : styles.successMsg}
            role="status"
          >
            {status.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function SocialLinksCard({ initialSocialLinks, initialShowSocialLinks }: SocialLinksProps) {
  const { t } = useI18n();
  const [links, setLinks] = useState<SocialLinkDraft[]>(initialSocialLinks);
  const [showLinks, setShowLinks] = useState(initialShowSocialLinks);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusBanner>(null);
  useAutoDismissOk(status, setStatus);

  function setLinkField(idx: number, field: 'label' | 'url', value: string) {
    setLinks((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }
  function addLink() {
    setLinks((prev) =>
      prev.length >= LINKS_MAX ? prev : [...prev, { _key: freshKey(), label: '', url: '' }],
    );
  }
  function removeLink(idx: number) {
    setLinks((prev) => prev.filter((_, i) => i !== idx));
  }

  function isLinkValid(l: SocialLinkDraft): boolean {
    if (!l.label.trim() || !l.url.trim()) return false;
    if (!/^https?:\/\//i.test(l.url.trim())) return false;
    return true;
  }
  function isLinkPartial(l: SocialLinkDraft): boolean {
    return (l.label.trim() !== '' || l.url.trim() !== '') && !isLinkValid(l);
  }
  const hasInvalidLink = links.some(isLinkPartial);

  async function handleSave() {
    if (busy || hasInvalidLink) return;
    setBusy(true);
    setStatus(null);
    // Local validity-trimmed copy with stable keys preserved — server gets
    // a stripped DTO without _key (the `wire` array below).
    const cleanLinks = links
      .map((l) => ({ _key: l._key, label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => isLinkValid(l));
    const wire = cleanLinks.map(({ label, url }) => ({ label, url }));
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          socialLinks: wire,
          showSocialLinks: showLinks,
        }),
      });
      if (!res.ok) {
        setStatus({ kind: 'err', message: t('account.profileContentSaveFailed') });
        return;
      }
      setLinks(cleanLinks);
      setStatus({ kind: 'ok', message: t('account.profileContentSaved') });
      track('profile_links_set', { linkCount: wire.length, showLinks });
    } catch {
      setStatus({ kind: 'err', message: t('account.profileContentSaveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-social" className={styles.card} aria-label={t('account.socialLinksTitle')}>
      <h2 className={styles.cardTitle}>{t('account.socialLinksTitle')}</h2>
      <p className={styles.usernameHint} style={{ marginTop: 0 }}>
        {t('account.socialLinksHint')}
      </p>

      <div className={styles.fieldGroup}>
        {links.length === 0 ? (
          <p className={styles.usernameHint} style={{ marginTop: 0 }}>
            {t('account.socialLinksEmpty')}
          </p>
        ) : null}
        {links.map((l, idx) => (
          <div className={styles.linkRow} key={l._key}>
            <input
              type="text"
              className={styles.linkLabelInput}
              maxLength={LINK_LABEL_MAX}
              placeholder={t('account.linkLabelPlaceholder')}
              value={l.label}
              onChange={(e) => setLinkField(idx, 'label', e.target.value)}
            />
            <input
              type="url"
              className={styles.linkUrlInput}
              maxLength={LINK_URL_MAX}
              placeholder="https://…"
              value={l.url}
              onChange={(e) => setLinkField(idx, 'url', e.target.value)}
              aria-invalid={isLinkPartial(l) || undefined}
            />
            <button
              type="button"
              className={styles.linkRemove}
              onClick={() => removeLink(idx)}
              aria-label={t('account.linkRemoveAria')}
            >
              ×
            </button>
          </div>
        ))}
        {links.length < LINKS_MAX ? (
          <button type="button" className={styles.linkAdd} onClick={addLink}>
            + {t('account.linkAdd')}
          </button>
        ) : null}
      </div>

      <div className={styles.toggleRow}>
        <label className={styles.toggleLabel} htmlFor="show-social-links-toggle">
          {t('account.showSocialLinksLabel')}
          <span className={styles.toggleSubLabel}>
            {showLinks ? t('account.showSocialLinksOnHint') : t('account.showSocialLinksOffHint')}
          </span>
        </label>
        <button
          type="button"
          id="show-social-links-toggle"
          className={`${styles.toggle}${showLinks ? ' ' + styles.toggleOn : ''}`}
          role="switch"
          aria-checked={showLinks}
          aria-label={t('account.showSocialLinksAria')}
          onClick={() => setShowLinks((v) => !v)}
        />
      </div>

      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={() => void handleSave()}
          disabled={busy || hasInvalidLink}
        >
          {busy ? t('account.saving') : t('account.profileContentSave')}
        </button>
        {hasInvalidLink ? (
          <p className={styles.errorMsg} role="alert">{t('account.linkInvalid')}</p>
        ) : status ? (
          <p
            className={status.kind === 'err' ? styles.errorMsg : styles.successMsg}
            role="status"
          >
            {status.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function FeaturedCafesCard() {
  const { t, locale } = useI18n();
  const { visitedShops } = useApp();
  const [cafes, setCafes] = useState<FeaturedCafeDraft[]>([]);
  const [cafeQuery, setCafeQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusBanner>(null);
  useAutoDismissOk(status, setStatus);
  const cafeAutocomplete = useCafeAutocomplete(locale === 'zh' ? 'zh-CN' : locale);

  // Hydrate the featured-cafes list from /api/account on mount. Lives in
  // its own table, so it can't piggyback on the Better Auth session like
  // the other profile fields do.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/account');
        if (!res.ok) return;
        const data = (await res.json()) as {
          featuredCafes?: Array<Omit<FeaturedCafeDraft, 'note' | 'linkInstagram' | 'linkWebsite' | 'linkMenu' | 'linkBookingExternal' | 'ownerPinnedNote' | 'websiteUri'> & {
            note: string | null;
            linkInstagram: string | null;
            linkWebsite: string | null;
            linkMenu: string | null;
            linkBookingExternal: string | null;
            ownerPinnedNote: string | null;
          }>;
        };
        if (cancelled || !data.featuredCafes) return;
        setCafes(
          data.featuredCafes.map((c) => ({
            placeId: c.placeId,
            name: c.name,
            address: c.address,
            lat: c.lat,
            lng: c.lng,
            relation: c.relation,
            note: c.note ?? '',
            linkInstagram: c.linkInstagram ?? '',
            linkWebsite: c.linkWebsite ?? '',
            linkMenu: c.linkMenu ?? '',
            linkBookingExternal: c.linkBookingExternal ?? '',
            ownerPinnedNote: c.ownerPinnedNote ?? '',
            // websiteUri is server-only — not returned by GET. Stays null
            // until the user re-picks via autocomplete; verification flag
            // we already have stays sticky.
            websiteUri: null,
            ownerVerified: c.ownerVerified,
          })),
        );
      } catch {
        /* keep cafes empty — user can still add fresh ones */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Top passport cafes — sorted by visit count desc. Powers the one-tap
   * "from your passport" picker so the most common case ("add a favorite
   * I've already stamped") doesn't require typing into autocomplete.
   * Filtered to exclude cafes already in the featured list so the user
   * can't accidentally add a duplicate (the (user_id, place_id) PK on
   * the server would reject it anyway). */
  const featuredPlaceIds = new Set(cafes.map((c) => c.placeId));
  const passportPicks = visitedShops
    .filter((s) => s.visits.length > 0 && !featuredPlaceIds.has(s.id))
    .slice()
    .sort((a, b) => b.visits.length - a.visits.length || a.name.localeCompare(b.name))
    .slice(0, 5);

  function addCafe(picked: Parameters<typeof emptyCafeFromPicked>[0], relation: FeaturedCafeRelation) {
    if (cafes.some((c) => c.placeId === picked.placeId)) return;
    setCafes((prev) => [...prev, emptyCafeFromPicked(picked, relation)]);
    setCafeQuery('');
    cafeAutocomplete.clear();
  }

  function pickPassportCafe(shop: typeof visitedShops[number]) {
    // Passport pick → no websiteUri (we never stored it client-side); the
    // user can re-pick via search if they want owner verification.
    addCafe(
      { placeId: shop.id, name: shop.name, address: shop.address, lat: shop.lat, lng: shop.lng, websiteUri: null },
      'favorite',
    );
  }

  function updateCafe(idx: number, patch: Partial<FeaturedCafeDraft>) {
    setCafes((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function removeCafe(idx: number) {
    setCafes((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    // Strip blanks from each cafe's optional fields and snapshot the
    // payload before the fetch. Server collapses '' → NULL anyway but
    // doing it here keeps the wire smaller and keeps the user's local
    // state aligned with what gets persisted.
    const cleanCafes = cafes.map((c) => ({
      placeId: c.placeId,
      name: c.name,
      address: c.address,
      lat: c.lat,
      lng: c.lng,
      relation: c.relation,
      note: c.note.trim() || null,
      linkInstagram: c.linkInstagram.trim() || null,
      linkWebsite: c.linkWebsite.trim() || null,
      linkMenu: c.linkMenu.trim() || null,
      linkBookingExternal: c.linkBookingExternal.trim() || null,
      ownerPinnedNote: c.ownerPinnedNote.trim() || null,
      websiteUri: c.websiteUri,
    }));
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ featuredCafes: cleanCafes }),
      });
      if (!res.ok) {
        setStatus({ kind: 'err', message: t('account.profileContentSaveFailed') });
        return;
      }
      // Re-fetch so the verified flag reflects the server's decision
      // after this save. Cheap; one row per cafe and we cap at 5.
      try {
        const refresh = await fetch('/api/account');
        if (refresh.ok) {
          const data = (await refresh.json()) as {
            featuredCafes?: Array<{
              placeId: string; name: string; address: string; lat: number; lng: number;
              relation: FeaturedCafeRelation;
              note: string | null;
              linkInstagram: string | null; linkWebsite: string | null; linkMenu: string | null; linkBookingExternal: string | null;
              ownerPinnedNote: string | null;
              ownerVerified: boolean;
            }>;
          };
          if (data.featuredCafes) {
            setCafes(
              data.featuredCafes.map((c) => ({
                placeId: c.placeId, name: c.name, address: c.address, lat: c.lat, lng: c.lng,
                relation: c.relation,
                note: c.note ?? '',
                linkInstagram: c.linkInstagram ?? '',
                linkWebsite: c.linkWebsite ?? '',
                linkMenu: c.linkMenu ?? '',
                linkBookingExternal: c.linkBookingExternal ?? '',
                ownerPinnedNote: c.ownerPinnedNote ?? '',
                websiteUri: null,
                ownerVerified: c.ownerVerified,
              })),
            );
          }
        }
      } catch {
        /* non-fatal — local state already has the unverified default */
      }
      setStatus({ kind: 'ok', message: t('account.profileContentSaved') });
      track('profile_cafes_set', {
        cafeCount: cleanCafes.length,
        ownedCount: cleanCafes.filter((c) => c.relation === 'owned').length,
      });
    } catch {
      setStatus({ kind: 'err', message: t('account.profileContentSaveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-cafes" className={styles.card} aria-label={t('account.featuredCafeLabel')}>
      <h2 className={styles.cardTitle}>{t('account.featuredCafeLabel')}</h2>
      <p className={styles.usernameHint} style={{ marginTop: 0 }}>
        {t('account.featuredCafeHint')}
      </p>

      {/* Featured cafés — up to 5 Places, each with its own relation,
          note, links, and (for owned) pinned note. Render order follows
          the array; remove + re-add to reorder (drag is v2). On desktop
          the cards lay out in a 2-column grid so 5 entries fit in 3 rows
          instead of 5; below the breakpoint they stack as before. */}
      <div className={styles.fieldGroup}>
        <div className={styles.featuredCafeGrid}>
        {cafes.map((cafe, idx) => (
          <div key={cafe.placeId} className={styles.featuredCafeCard}>
            <div className={styles.featuredCafeChosen}>
              <div className={styles.featuredCafeMeta}>
                <strong>
                  {cafe.name}
                  {cafe.relation === 'owned' && cafe.ownerVerified ? (
                    <span
                      className={styles.featuredCafeVerified}
                      title={t('account.featuredCafeVerifiedTitle')}
                      aria-label={t('account.featuredCafeVerifiedTitle')}
                    >
                      {' '}✓
                    </span>
                  ) : null}
                </strong>
                <span className={styles.featuredCafeAddress}>{cafe.address}</span>
              </div>
              <button
                type="button"
                className={styles.linkRemove}
                onClick={() => removeCafe(idx)}
                aria-label={t('account.featuredCafeRemoveAria')}
              >
                ×
              </button>
            </div>

            <div
              className={styles.featuredCafeRelation}
              role="radiogroup"
              aria-label={t('account.featuredCafeRelationLabel')}
            >
              <button
                type="button"
                role="radio"
                aria-checked={cafe.relation === 'favorite'}
                className={`${styles.featuredCafeRelationPill}${
                  cafe.relation === 'favorite'
                    ? ' ' + styles.featuredCafeRelationPillActive
                    : ''
                }`}
                onClick={() => updateCafe(idx, { relation: 'favorite' })}
              >
                <span className={styles.featuredCafeRelationPillTitle}>
                  <span aria-hidden>❤️</span>
                  {t('account.featuredCafeRelationFavoriteTitle')}
                </span>
                <span className={styles.featuredCafeRelationPillHint}>
                  {t('account.featuredCafeRelationFavoriteHint')}
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={cafe.relation === 'owned'}
                className={`${styles.featuredCafeRelationPill}${
                  cafe.relation === 'owned'
                    ? ' ' + styles.featuredCafeRelationPillActive
                    : ''
                }`}
                onClick={() => updateCafe(idx, { relation: 'owned' })}
              >
                <span className={styles.featuredCafeRelationPillTitle}>
                  <span aria-hidden>🏠</span>
                  {t('account.featuredCafeRelationOwnedTitle')}
                </span>
                <span className={styles.featuredCafeRelationPillHint}>
                  {t('account.featuredCafeRelationOwnedHint')}
                </span>
              </button>
            </div>

            {/* Verification status hint on owned cards: explain why the
                badge is/isn't showing. Most useful for unverified owners
                so they know auto-verify is gated on email-domain match. */}
            {cafe.relation === 'owned' ? (
              <p
                className={styles.usernameHint}
                style={{ marginTop: 6, marginBottom: 0 }}
              >
                {cafe.ownerVerified
                  ? t('account.featuredCafeVerifiedHint')
                  : t('account.featuredCafeUnverifiedHint')}
              </p>
            ) : null}

            {/* "Why this café" — short blurb under the address. Same
                shape as bio. Empty stays empty. */}
            <label className={styles.fieldGroup} style={{ marginTop: 12 }}>
              <span className={styles.fieldLabel}>
                {t('account.featuredCafeNoteLabel')}
              </span>
              <textarea
                className={styles.bioTextarea}
                rows={2}
                maxLength={FEATURED_NOTE_MAX}
                placeholder={t('account.featuredCafeNotePlaceholder')}
                value={cafe.note}
                onChange={(e) => updateCafe(idx, { note: e.target.value })}
              />
              <span className={styles.charCount}>
                {cafe.note.length} / {FEATURED_NOTE_MAX}
              </span>
            </label>

            {/* Owned-only "what's brewing" pinned note — shorter, framed
                as "this week's special" so owners are nudged to refresh
                rather than treating it as a static second blurb. */}
            {cafe.relation === 'owned' ? (
              <label className={styles.fieldGroup} style={{ marginTop: 8 }}>
                <span className={styles.fieldLabel}>
                  {t('account.featuredCafePinnedLabel')}
                </span>
                <input
                  type="text"
                  className={styles.linkLabelInput}
                  maxLength={FEATURED_PINNED_NOTE_MAX}
                  placeholder={t('account.featuredCafePinnedPlaceholder')}
                  value={cafe.ownerPinnedNote}
                  onChange={(e) => updateCafe(idx, { ownerPinnedNote: e.target.value })}
                />
                <span className={styles.charCount}>
                  {cafe.ownerPinnedNote.length} / {FEATURED_PINNED_NOTE_MAX}
                </span>
              </label>
            ) : null}

            {/* 4 typed link slots — the public profile picks an icon per
                slot. Empty slots collapse on save. We don't validate
                live; server enforces http(s). */}
            <div className={styles.fieldGroup} style={{ marginTop: 8 }}>
              <span className={styles.fieldLabel}>{t('account.featuredCafeLinksLabel')}</span>
              {(
                [
                  ['linkInstagram', t('account.featuredCafeLinkInstagram')],
                  ['linkWebsite', t('account.featuredCafeLinkWebsite')],
                  ['linkMenu', t('account.featuredCafeLinkMenu')],
                  ['linkBookingExternal', t('account.featuredCafeLinkBooking')],
                ] as Array<[keyof FeaturedCafeDraft, string]>
              ).map(([field, label]) => (
                <div className={styles.linkRow} key={field}>
                  <span className={styles.linkLabelInput} style={{ pointerEvents: 'none' }}>
                    {label}
                  </span>
                  <input
                    type="url"
                    className={styles.linkUrlInput}
                    maxLength={FEATURED_LINK_MAX}
                    placeholder="https://…"
                    value={cafe[field] as string}
                    onChange={(e) => updateCafe(idx, { [field]: e.target.value } as Partial<FeaturedCafeDraft>)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        </div>

        {/* Add surface — only visible when we're under the cap. Mirrors
            the v1 single-card empty-state UI: passport quick-pick row +
            search input. Each pick pushes a new card with default
            relation='favorite'; the user flips to 'owned' on the new
            card if they want, which triggers verification on next save. */}
        {cafes.length < FEATURED_MAX ? (
          <>
            <p className={styles.usernameHint} style={{ marginTop: 12, marginBottom: 4 }}>
              {t('account.featuredCafeAddPrompt', {
                remaining: FEATURED_MAX - cafes.length,
              })}
            </p>
            {passportPicks.length > 0 ? (
              <div className={styles.featuredCafePassport}>
                <span className={styles.featuredCafePassportLabel}>
                  {t('account.featuredCafeFromPassport')}
                </span>
                <ul className={styles.featuredCafePassportList}>
                  {passportPicks.map((shop) => (
                    <li key={shop.id}>
                      <button
                        type="button"
                        className={styles.featuredCafePassportItem}
                        onClick={() => pickPassportCafe(shop)}
                      >
                        <span className={styles.featuredCafePassportItemName}>
                          {shop.name}
                        </span>
                        <span className={styles.featuredCafePassportItemMeta}>
                          {shop.city ?? shop.address}
                          {' · '}
                          {t('account.featuredCafeVisitCount', { count: shop.visits.length })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className={styles.featuredCafeSearch}>
              <input
                type="text"
                className={styles.linkLabelInput}
                placeholder={t('account.featuredCafePlaceholder')}
                value={cafeQuery}
                onChange={(e) => {
                  setCafeQuery(e.target.value);
                  cafeAutocomplete.query(e.target.value);
                }}
                onBlur={() => {
                  window.setTimeout(() => cafeAutocomplete.clear(), 150);
                }}
              />
              {cafeAutocomplete.suggestions.length > 0 ? (
                <ul className={styles.featuredCafeSuggestions} role="listbox">
                  {cafeAutocomplete.suggestions.map((s, i) => {
                    const text = s.placePrediction?.text.text ?? '';
                    if (!text) return null;
                    return (
                      <li key={`${i}-${text}`}>
                        <button
                          type="button"
                          className={styles.featuredCafeSuggestion}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={async () => {
                            const picked = await cafeAutocomplete.pick(s);
                            if (picked) addCafe(picked, 'favorite');
                          }}
                        >
                          {text}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </>
        ) : (
          <p className={styles.usernameHint} style={{ marginTop: 12 }}>
            {t('account.featuredCafeAtMax', { max: FEATURED_MAX })}
          </p>
        )}
      </div>

      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={() => void handleSave()}
          disabled={busy}
        >
          {busy ? t('account.saving') : t('account.profileContentSave')}
        </button>
        {status ? (
          <p
            className={status.kind === 'err' ? styles.errorMsg : styles.successMsg}
            role="status"
          >
            {status.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

interface DaySlot {
  enabled: boolean;
  start: string;
  end: string;
}

type Availability = Record<Weekday, DaySlot>;

const DEFAULT_SLOT: DaySlot = { enabled: false, start: '14:00', end: '17:00' };

function emptyAvailability(): Availability {
  const out = {} as Availability;
  for (const d of WEEKDAYS) out[d] = { ...DEFAULT_SLOT };
  return out;
}

function parseInitialAvailability(raw: string | undefined): Availability {
  const out = emptyAvailability();
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return out;
    for (const d of WEEKDAYS) {
      const slot = (parsed as Record<string, unknown>)[d];
      if (
        slot &&
        typeof slot === 'object' &&
        typeof (slot as DaySlot).enabled === 'boolean' &&
        typeof (slot as DaySlot).start === 'string' &&
        typeof (slot as DaySlot).end === 'string'
      ) {
        out[d] = { ...(slot as DaySlot) };
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

interface BookingSetupProps {
  initialAddress: string;
  initialAvailability: Availability;
  /** Used to render the public booking link the user can copy/share. Empty
   *  when the user hasn't claimed a username yet. */
  username: string;
  /** Whether the user has published their profile. The link only works if
   *  profile_public=true, so we hide the share row otherwise. */
  profilePublic: boolean;
}

/**
 * Phase 2.A: organizer-side booking config. Address is one endpoint of the
 * midpoint search; weekly availability says when bookings are accepted.
 * The actual booking widget on /yourname (Phase 2.B) reads these two and
 * renders a "pick a slot" UI for visitors. Until both are filled in, the
 * widget stays in its "coming soon" placeholder state on profile pages.
 */
function BookingSetupCard({
  initialAddress,
  initialAvailability,
  username,
  profilePublic,
}: BookingSetupProps) {
  const { t } = useI18n();
  const [address, setAddress] = useState(initialAddress);
  const [days, setDays] = useState<Availability>(initialAvailability);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusBanner>(null);
  useAutoDismissOk(status, setStatus);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  // Use the current origin so staging / preview deployments link back
  // to themselves instead of pointing the recipient at the prod host
  // (where their booking-day setup wouldn't exist yet).
  const bookingLink =
    username && profilePublic ? `${window.location.origin}/${username}` : null;
  const handleCopyLink = async () => {
    if (!bookingLink) return;
    try {
      await navigator.clipboard.writeText(bookingLink);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      // Clipboard blocked (rare on https); silently no-op rather than
      // surface an error UI for an action the user retries naturally.
    }
  };

  function setDay(day: Weekday, patch: Partial<DaySlot>) {
    setDays((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  // A day is "valid" if it's disabled OR start < end. The Save button blocks
  // on any inverted range so the server doesn't have to bounce a 400.
  const invalidDay = WEEKDAYS.find(
    (d) => days[d].enabled && days[d].start >= days[d].end,
  );

  async function handleSave() {
    if (busy || invalidDay) return;
    setBusy(true);
    setStatus(null);
    // Wire format: only send days that are enabled OR explicitly set; same
    // shape on the server. Empty object = "no availability".
    const payload: Record<Weekday, DaySlot> = {} as Record<Weekday, DaySlot>;
    for (const d of WEEKDAYS) payload[d] = days[d];
    // Capture the browser's IANA tz so the server can interpret
    // "Mon 14:00-17:00" as 2-5pm in the organizer's actual hometown
    // rather than UTC wall-clock.
    let tz = 'UTC';
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      /* fall back to UTC */
    }
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          homeBaseAddress: address.trim() ? address.trim() : null,
          availabilitySlots: payload,
          timezone: tz,
        }),
      });
      if (!res.ok) {
        setStatus({ kind: 'err', message: t('account.bookingSaveFailed') });
        return;
      }
      setStatus({ kind: 'ok', message: t('account.bookingSaved') });
      track('booking_config_set', {
        hasAddress: !!address.trim(),
        enabledDays: WEEKDAYS.filter((d) => days[d].enabled).length,
      });
    } catch {
      setStatus({ kind: 'err', message: t('account.bookingSaveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-booking" className={styles.card} aria-label={t('account.bookingTitle')}>
      <h2 className={styles.cardTitle}>{t('account.bookingTitle')}</h2>
      <p className={styles.usernameHint} style={{ marginTop: 0 }}>
        {t('account.bookingHint')}
      </p>

      {bookingLink ? (
        <div className={styles.bookingLinkRow}>
          <span className={styles.bookingLinkLabel}>{t('account.bookingLinkLabel')}</span>
          <a
            href={bookingLink}
            target="_blank"
            rel="noreferrer"
            className={styles.bookingLinkValue}
          >
            {bookingLink.replace(/^https?:\/\//, '')}
          </a>
          <button
            type="button"
            className={styles.bookingLinkCopy}
            onClick={() => void handleCopyLink()}
          >
            {copyState === 'copied'
              ? t('account.bookingLinkCopied')
              : t('account.bookingLinkCopy')}
          </button>
        </div>
      ) : null}

      <label className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>{t('account.homeBaseLabel')}</span>
        <input
          type="text"
          className={styles.usernameInput}
          maxLength={200}
          placeholder={t('account.homeBasePlaceholder')}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <span className={styles.usernameHint}>{t('account.homeBaseHint')}</span>
      </label>

      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>{t('account.availabilityLabel')}</span>
        {WEEKDAYS.map((d) => {
          const slot = days[d];
          const inverted = slot.enabled && slot.start >= slot.end;
          return (
            <div key={d} className={styles.dayRow}>
              <label className={styles.dayToggle}>
                <input
                  type="checkbox"
                  checked={slot.enabled}
                  onChange={(e) => setDay(d, { enabled: e.target.checked })}
                />
                <span className={styles.dayName}>{t(`account.weekday.${d}`)}</span>
              </label>
              <input
                type="time"
                className={styles.timeInput}
                value={slot.start}
                disabled={!slot.enabled}
                onChange={(e) => setDay(d, { start: e.target.value })}
                aria-invalid={inverted || undefined}
              />
              <span className={styles.timeSep} aria-hidden>→</span>
              <input
                type="time"
                className={styles.timeInput}
                value={slot.end}
                disabled={!slot.enabled}
                onChange={(e) => setDay(d, { end: e.target.value })}
                aria-invalid={inverted || undefined}
              />
            </div>
          );
        })}
      </div>

      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={() => void handleSave()}
          disabled={busy || invalidDay !== undefined}
        >
          {busy ? t('account.saving') : t('account.bookingSave')}
        </button>
        {invalidDay ? (
          <p className={styles.errorMsg} role="alert">
            {t('account.bookingInvalidRange')}
          </p>
        ) : status ? (
          <p
            className={status.kind === 'err' ? styles.errorMsg : styles.successMsg}
            role="status"
          >
            {status.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** Better Auth additionalFields can come back as Date | number | string
 *  (ISO) | null depending on JSON serialisation path. Normalise to ms. */
function msFromMaybe(v: string | Date | number | null | undefined): number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : null;
}

interface CalendarSyncProps {
  initialUrl: string;
  initialSyncedAt: number | null;
  initialLastError: string | null;
  initialLastErrorAt: number | null;
}

/**
 * iCal URL subscription. Whatever the organizer publishes here gets
 * fetched by the availability endpoint to subtract real busy events from
 * the offered slots — so a recurring stand-up on Mon 14:00 doesn't show
 * up as bookable just because their weekly availability says
 * "Mon 14:00–17:00".
 *
 * Save calls /api/account which probe-fetches the URL and 400s if the
 * feed is unreachable / not iCalendar — surfacing the parser error
 * directly so the user knows whether they pasted the wrong URL.
 */
function CalendarSyncCard({
  initialUrl,
  initialSyncedAt,
  initialLastError,
  initialLastErrorAt,
}: CalendarSyncProps) {
  const { t, locale } = useI18n();
  const [url, setUrl] = useState(initialUrl);
  const [syncedAt, setSyncedAt] = useState<number | null>(initialSyncedAt);
  // Last-error state mirrors what's on the user row. Cleared in the UI
  // immediately on save attempt so an old error doesn't linger after
  // the user fixes the URL — server will re-record on the next failed
  // visitor view if the new URL is also broken.
  const [lastError, setLastError] = useState<string | null>(initialLastError);
  const [lastErrorAt, setLastErrorAt] = useState<number | null>(initialLastErrorAt);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusBanner>(null);
  useAutoDismissOk(status, setStatus);
  // Track the last-saved baseline locally so `dirty` resets after a
  // successful save. Comparing against the prop alone left the Save
  // button enabled forever once a save landed: the prop is stale until
  // the parent re-fetches, but the user has nothing new to save.
  const [savedUrl, setSavedUrl] = useState(initialUrl);
  const dirty = url.trim() !== savedUrl.trim();

  async function send(payload: { busyCalendarIcsUrl: string | null }) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({
          kind: 'err',
          message: j.error ?? t('account.calendarSaveFailed'),
        });
        return;
      }
      if (payload.busyCalendarIcsUrl == null) {
        setSyncedAt(null);
      } else {
        setSyncedAt(Date.now());
      }
      // PATCH /api/account already probe-fetches the URL; reaching here
      // means it parsed OK at save time. Clear any stale error so the
      // UI doesn't keep nagging until the next visitor view.
      setLastError(null);
      setLastErrorAt(null);
      // Save baseline → next dirty check will read clean.
      setSavedUrl(payload.busyCalendarIcsUrl ?? '');
      setStatus({ kind: 'ok', message: t('account.calendarSaved') });
    } catch {
      setStatus({ kind: 'err', message: t('account.calendarSaveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-calendar" className={styles.card} aria-label={t('account.calendarTitle')}>
      <h2 className={styles.cardTitle}>{t('account.calendarTitle')}</h2>
      <p className={styles.usernameHint} style={{ marginTop: 0 }}>
        {t('account.calendarHint')}
      </p>

      <label className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>{t('account.calendarUrlLabel')}</span>
        <input
          type="url"
          className={styles.usernameInput}
          maxLength={500}
          inputMode="url"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          placeholder={t('account.calendarUrlPlaceholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <span className={styles.usernameHint}>{t('account.calendarUrlHelp')}</span>
      </label>

      {lastError ? (
        <p className={styles.calendarErrorBanner} role="alert">
          <strong>{t('account.calendarBrokenTitle')}</strong>
          <br />
          {t('account.calendarBrokenBody', {
            when: lastErrorAt
              ? new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(lastErrorAt))
              : '',
            error: lastError,
          })}
        </p>
      ) : syncedAt ? (
        <p className={styles.usernameHint} style={{ marginTop: 0 }}>
          {t('account.calendarLastSync', {
            date: new Intl.DateTimeFormat(locale, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(syncedAt)),
          })}
        </p>
      ) : null}

      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={() => void send({ busyCalendarIcsUrl: url.trim() ? url.trim() : null })}
          disabled={busy || (!dirty && initialUrl.trim() === '')}
        >
          {busy ? t('account.saving') : t('account.calendarSave')}
        </button>
        {initialUrl.trim() ? (
          <button
            type="button"
            className={styles.signOutButton}
            onClick={() => {
              setUrl('');
              void send({ busyCalendarIcsUrl: null });
            }}
            disabled={busy}
            style={{ marginLeft: '0.5rem' }}
          >
            {t('account.calendarDisconnect')}
          </button>
        ) : null}
        {status ? (
          <p
            className={status.kind === 'err' ? styles.errorMsg : styles.successMsg}
            role="status"
          >
            {status.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
