import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { authClient, useSession } from '../utils/authClient';
import { usePassportStats } from '../hooks/usePassportStats';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { PASSPORT_PATH } from '../routes';
import { formatAbsoluteDate } from '../utils/relativeTime';
import { track } from '../utils/analytics';
import { HeaderNavLinks } from './HeaderNavLinks';
import { LanguageSwitcher } from './LanguageSwitcher';
import styles from './AccountPage.module.css';

const USERNAME_REGEX = /^[a-z][a-z0-9_-]{2,29}$/;
const CHECK_DEBOUNCE_MS = 350;
const DELETE_CONFIRM_PHRASE = 'DELETE';

/* Username picker is gated until Pro launches — keep good names reserved.
 * The form is intact; flipping this back to true re-enables it everywhere
 * without touching server endpoints (which also gate on their own copy). */
const USERNAMES_PUBLIC = false;

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
        if (res.status === 409) message = t('account.usernameTaken');
        else if (res.status === 400) message = t('account.usernameInvalid');
        else {
          try {
            const j = (await res.json()) as { error?: string };
            if (j.error) message = j.error;
          } catch {
            /* ignore */
          }
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
    await authClient.signOut();
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
    </section>
  );
}
