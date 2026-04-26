import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { authClient, useSession } from '../utils/authClient';
import { usePassportStats } from '../hooks/usePassportStats';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { formatAbsoluteDate } from '../utils/relativeTime';
import { track } from '../utils/analytics';
import { HeaderNavLinks } from './HeaderNavLinks';
import { LanguageSwitcher } from './LanguageSwitcher';
import styles from './AccountPage.module.css';

const USERNAME_REGEX = /^[a-z][a-z0-9_-]{2,29}$/;

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; value: string | null }
  | { kind: 'error'; message: string };

export function AccountPage() {
  const { t, locale } = useI18n();
  const { visitedShops } = useApp();
  const { data: session, refetch: refetchSession } = useSession();
  const stats = usePassportStats(visitedShops);
  const homeHref = buildLocalizedPathname('/', locale);

  // Better Auth additionalFields → username sits on session.user.
  const sessionUser = session?.user as
    | { email?: string; createdAt?: string | Date; username?: string | null }
    | undefined;
  const initialUsername = sessionUser?.username ?? '';

  const [draft, setDraft] = useState<string>(initialUsername);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });

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

  const trimmed = draft.trim().toLowerCase();
  const cleared = trimmed === '';
  const validFormat = cleared || USERNAME_REGEX.test(trimmed);
  const dirty = trimmed !== (initialUsername ?? '').toLowerCase();
  const canSubmit = validFormat && dirty && save.kind !== 'saving';

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
      // Refresh session so subsequent renders see the new username.
      void refetchSession?.();
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

  const createdAtRaw = sessionUser.createdAt;
  const createdAt = createdAtRaw
    ? typeof createdAtRaw === 'string'
      ? new Date(createdAtRaw).getTime()
      : createdAtRaw.getTime()
    : null;

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
                aria-invalid={!validFormat || undefined}
                aria-describedby="username-hint"
              />
            </div>
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
          </form>
        </section>

        <section className={styles.card} aria-label={t('account.statsTitle')}>
          <h2 className={styles.cardTitle}>{t('account.statsTitle')}</h2>
          <div className={styles.statsRow}>
            <div className={styles.statCell}>
              <div className={styles.statCellValue}>{stats.shops}</div>
              <div className={styles.statCellLabel}>{t('passport.statShops')}</div>
            </div>
            <div className={styles.statCell}>
              <div className={styles.statCellValue}>{stats.total}</div>
              <div className={styles.statCellLabel}>{t('passport.statVisits')}</div>
            </div>
            <div className={styles.statCell}>
              <div className={styles.statCellValue}>{stats.streak}</div>
              <div className={styles.statCellLabel}>{t('passport.statStreak')}</div>
            </div>
          </div>
        </section>

        <section className={`${styles.card} ${styles.signOutCard}`}>
          <h2 className={styles.cardTitle}>{t('account.session')}</h2>
          <button type="button" className={styles.signOutButton} onClick={() => void handleSignOut()}>
            {t('auth.signOut')}
          </button>
        </section>
      </main>
    </div>
  );
}
