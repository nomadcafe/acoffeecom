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
  // Ref for the slug input so the home-page CTA's `?focus=username`
  // landing can scroll it into view and put the cursor in it on first
  // paint. Mount-time effect below consumes this.
  const usernameInputRef = useRef<HTMLInputElement>(null);

  // Honour `?focus=username` from the HomeFooterCta callback URL: scroll
  // the slug card into view, focus the input, then strip the param so a
  // page refresh / share doesn't re-trigger the auto-focus. Runs once.
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
    setRevokingId(s.id);
    try {
      const res = await fetch(`/api/account/sessions/${encodeURIComponent(s.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setRevokingId(null);
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
    } finally {
      setRevokingId(null);
    }
  }

  function handleExportAll() {
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
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `acoffee-account-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    track('account_data_exported', {
      shopCount: visitedShops.length,
      starredCount: starredShops.length,
    });
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

        <section className={styles.card} aria-label={t('account.identityTitle')}>
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
          <section className={styles.card} aria-label={t('account.usernameTitle')}>
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
          <section className={styles.card} aria-label={t('account.usernameTitle')}>
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

        <ProfileContentCard
          initialDisplayName={
            (sessionUser as { displayName?: string | null }).displayName ?? ''
          }
          initialBio={(sessionUser as { bio?: string | null }).bio ?? ''}
          initialSocialLinks={parseInitialSocialLinks(
            (sessionUser as { socialLinks?: string }).socialLinks,
          )}
          initialShowSocialLinks={
            (sessionUser as { showSocialLinks?: boolean }).showSocialLinks !== false
          }
          initialOwnerCafe={parseInitialOwnerCafe(
            sessionUser as Parameters<typeof parseInitialOwnerCafe>[0],
          )}
        />

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

        <section className={styles.card} aria-label={t('account.statsTitle')}>
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

        <section className={styles.card} aria-label={t('account.exportTitle')}>
          <h2 className={styles.cardTitle}>{t('account.exportTitle')}</h2>
          <p className={styles.dangerHint} style={{ color: 'var(--ac-text-muted)' }}>
            {t('account.exportHint')}
          </p>
          <button type="button" className={styles.saveButton} onClick={handleExportAll}>
            {t('account.exportButton')}
          </button>
        </section>

        <section className={styles.card} aria-label={t('account.sessionsTitle')}>
          <h2 className={styles.cardTitle}>{t('account.sessionsTitle')}</h2>
          {sessionsState.kind === 'loading' ? (
            <p className={styles.sessionLoading}>{t('account.sessionsLoading')}</p>
          ) : sessionsState.kind === 'error' ? (
            <p className={styles.sessionEmpty}>{t('account.sessionsError')}</p>
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
        </section>

        <section className={`${styles.card} ${styles.signOutCard}`}>
          <h2 className={styles.cardTitle}>{t('account.session')}</h2>
          <button type="button" className={styles.signOutButton} onClick={() => void handleSignOut()}>
            {t('auth.signOut')}
          </button>
        </section>

        <section
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

  // Focus the input on mount and trap Escape to close.
  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
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
        // Click on dim backdrop closes (but click inside dialog doesn't bubble).
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className={styles.modalDialog}>
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
    <section className={styles.card} aria-label={t('account.profileTitle')}>
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
    <section className={styles.card} aria-label={t('account.recapTitle')}>
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

interface SocialLinkDraft {
  label: string;
  url: string;
}

function parseInitialSocialLinks(raw: string | undefined): SocialLinkDraft[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (l): l is SocialLinkDraft =>
          l && typeof l === 'object' && typeof l.label === 'string' && typeof l.url === 'string',
      )
      .slice(0, 5);
  } catch {
    return [];
  }
}

interface InitialOwnerCafe {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

function parseInitialOwnerCafe(sessionUser: {
  ownerCafePlaceId?: string | null;
  ownerCafeName?: string | null;
  ownerCafeAddress?: string | null;
  ownerCafeLat?: number | null;
  ownerCafeLng?: number | null;
}): InitialOwnerCafe | null {
  if (
    !sessionUser.ownerCafePlaceId ||
    !sessionUser.ownerCafeName ||
    !sessionUser.ownerCafeAddress ||
    typeof sessionUser.ownerCafeLat !== 'number' ||
    typeof sessionUser.ownerCafeLng !== 'number'
  ) {
    return null;
  }
  return {
    placeId: sessionUser.ownerCafePlaceId,
    name: sessionUser.ownerCafeName,
    address: sessionUser.ownerCafeAddress,
    lat: sessionUser.ownerCafeLat,
    lng: sessionUser.ownerCafeLng,
  };
}

interface ProfileContentProps {
  initialDisplayName: string;
  initialBio: string;
  initialSocialLinks: SocialLinkDraft[];
  initialShowSocialLinks: boolean;
  initialOwnerCafe: InitialOwnerCafe | null;
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
function ProfileContentCard({
  initialDisplayName,
  initialBio,
  initialSocialLinks,
  initialShowSocialLinks,
  initialOwnerCafe,
}: ProfileContentProps) {
  const { t, locale } = useI18n();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [links, setLinks] = useState<SocialLinkDraft[]>(initialSocialLinks);
  const [showLinks, setShowLinks] = useState(initialShowSocialLinks);
  const [ownerCafe, setOwnerCafe] = useState<InitialOwnerCafe | null>(initialOwnerCafe);
  const [cafeQuery, setCafeQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  // zh-CN is what Google's autocomplete expects; our locale code is `zh`.
  const cafeAutocomplete = useCafeAutocomplete(locale === 'zh' ? 'zh-CN' : locale);

  function setLinkField(idx: number, field: 'label' | 'url', value: string) {
    setLinks((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }
  function addLink() {
    setLinks((prev) => (prev.length >= LINKS_MAX ? prev : [...prev, { label: '', url: '' }]));
  }
  function removeLink(idx: number) {
    setLinks((prev) => prev.filter((_, i) => i !== idx));
  }

  // A link is committable only when both fields are filled and the URL parses
  // as http(s). Server enforces the same rule; this just lets us drop blank
  // rows silently on Save instead of erroring out.
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
    const cleanLinks = links
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter(isLinkValid);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() ? displayName.trim() : null,
          bio: bio.trim() ? bio.trim() : null,
          socialLinks: cleanLinks,
          showSocialLinks: showLinks,
          ownerCafe: ownerCafe,
        }),
      });
      if (!res.ok) {
        setStatus({ kind: 'err', message: t('account.profileContentSaveFailed') });
        return;
      }
      setLinks(cleanLinks); // strip any blanks that were filtered out
      setStatus({ kind: 'ok', message: t('account.profileContentSaved') });
      track('profile_content_set', {
        hasName: !!displayName.trim(),
        hasBio: !!bio.trim(),
        linkCount: cleanLinks.length,
        hasOwnerCafe: !!ownerCafe,
        showLinks,
      });
    } catch {
      setStatus({ kind: 'err', message: t('account.profileContentSaveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-label={t('account.profileContentTitle')}>
      <h2 className={styles.cardTitle}>{t('account.profileContentTitle')}</h2>
      <p className={styles.usernameHint} style={{ marginTop: 0 }}>
        {t('account.profileContentHint')}
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

      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>{t('account.socialLinksLabel')}</span>
        {links.length === 0 ? (
          <p className={styles.usernameHint} style={{ marginTop: 0 }}>
            {t('account.socialLinksEmpty')}
          </p>
        ) : null}
        {links.map((l, idx) => (
          <div className={styles.linkRow} key={idx}>
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

      {/* Show-links privacy toggle. Default on, so existing users with
          links don't silently disappear from their profile. */}
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

      {/* Featured cafe — single Place, optional. Renders above the
          passport on /yourname. We avoid a server-side Places hit by
          shipping the picker's resolved fields straight to PATCH. */}
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>{t('account.featuredCafeLabel')}</span>
        <p className={styles.usernameHint} style={{ marginTop: 0 }}>
          {t('account.featuredCafeHint')}
        </p>
        {ownerCafe ? (
          <div className={styles.featuredCafeChosen}>
            <div className={styles.featuredCafeMeta}>
              <strong>{ownerCafe.name}</strong>
              <span className={styles.featuredCafeAddress}>{ownerCafe.address}</span>
            </div>
            <button
              type="button"
              className={styles.linkRemove}
              onClick={() => setOwnerCafe(null)}
              aria-label={t('account.featuredCafeRemoveAria')}
            >
              ×
            </button>
          </div>
        ) : (
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
                // Defer clear so an in-progress click on a suggestion still
                // fires before the dropdown disappears.
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
                        onMouseDown={(e) => e.preventDefault() /* keep input focus */}
                        onClick={async () => {
                          const picked = await cafeAutocomplete.pick(s);
                          if (picked) {
                            setOwnerCafe(picked);
                            setCafeQuery('');
                          }
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
        )}
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
          <p className={styles.errorMsg} role="alert">
            {t('account.linkInvalid')}
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
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const bookingLink = username && profilePublic ? `https://acoffee.com/${username}` : null;
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
    <section className={styles.card} aria-label={t('account.bookingTitle')}>
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
  const [status, setStatus] = useState<
    { kind: 'ok' | 'err'; message: string } | null
  >(null);
  const dirty = url.trim() !== initialUrl.trim();

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
      setStatus({ kind: 'ok', message: t('account.calendarSaved') });
    } catch {
      setStatus({ kind: 'err', message: t('account.calendarSaveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-label={t('account.calendarTitle')}>
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
