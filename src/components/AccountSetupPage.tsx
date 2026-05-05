import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { useSession } from '../utils/authClient';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { ACCOUNT_PATH } from '../routes';
import styles from './AccountSetupPage.module.css';

// Header + nav components reused from AccountPage so the chrome looks
// identical; the wizard "feels" like part of /account, not a separate
// universe. Lazy-loaded for the same code-splitting reason AccountPage
// itself is.
const AccountMenu = lazy(() => import('./AccountMenu').then((m) => ({ default: m.AccountMenu })));

interface SessionUserView {
  username?: string | null;
  homeBaseAddress?: string | null;
  availabilitySlots?: string;
  email?: string;
}

type Step = 1 | 2 | 3 | 4;

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

/* Default availability presets — seeded into the wizard so most users
 * can confirm with one click and move on. Each value is a JSON string
 * shaped like the server's availabilitySlots column expects. */
const PRESET_WEEKDAY = JSON.stringify({
  mon: { enabled: true, start: '10:00', end: '18:00' },
  tue: { enabled: true, start: '10:00', end: '18:00' },
  wed: { enabled: true, start: '10:00', end: '18:00' },
  thu: { enabled: true, start: '10:00', end: '18:00' },
  fri: { enabled: true, start: '10:00', end: '18:00' },
  sat: { enabled: false, start: '10:00', end: '18:00' },
  sun: { enabled: false, start: '10:00', end: '18:00' },
});
const PRESET_ANYTIME = JSON.stringify({
  mon: { enabled: true, start: '09:00', end: '21:00' },
  tue: { enabled: true, start: '09:00', end: '21:00' },
  wed: { enabled: true, start: '09:00', end: '21:00' },
  thu: { enabled: true, start: '09:00', end: '21:00' },
  fri: { enabled: true, start: '09:00', end: '21:00' },
  sat: { enabled: true, start: '09:00', end: '21:00' },
  sun: { enabled: true, start: '09:00', end: '21:00' },
});

/**
 * First-run setup wizard. Walks new users through the 3 fields that are
 * actually load-bearing — username (so the public link works), home
 * base (so the booking widget knows where to anchor the AI cafe pick),
 * and availability (so the widget actually shows slots). Everything
 * else on /account (avatar, theme, social links, calendar sync,
 * featured cafes, etc.) is polish — the user can fill it in afterwards
 * on their own time.
 *
 * Why a wizard at all: the full /account page has 14 sections. A fresh
 * user doesn't know where to start, so they fill in maybe one field and
 * leave with a half-broken profile. Walking them through 3 decisions —
 * one per screen — converts dramatically better and leaves them with a
 * working, shareable acoffee.com/<handle>.
 *
 * Auto-skip: each step checks the session for the field it manages. If
 * the user has it set already (e.g. they came back to finish setup
 * after picking a username earlier), the wizard jumps to the first
 * unfilled step. Step 4 is the celebration / share-link screen.
 */
export function AccountSetupPage() {
  const { t, locale } = useI18n();
  const { data: session, isPending, refetch } = useSession();
  const sessionUser = session?.user as SessionUserView | undefined;

  // Pick the right starting step from the session. Re-run when the
  // session lands so a user who signs in mid-wizard doesn't sit on the
  // loading screen forever. Once the user has picked a step manually
  // (state below), we don't override it.
  const [step, setStep] = useState<Step | null>(null);
  useEffect(() => {
    if (step != null) return;
    if (!sessionUser) return;
    setStep(determineStep(sessionUser));
  }, [step, sessionUser]);

  const homeHref = buildLocalizedPathname('/', locale);
  const accountHref = buildLocalizedPathname(ACCOUNT_PATH, locale);

  if (isPending || step == null) {
    return (
      <div className={styles.app}>
        <Header homeHref={homeHref} />
        <main id="content" tabIndex={-1} className={styles.main} aria-busy="true" />
      </div>
    );
  }

  if (!sessionUser?.email) {
    /* Edge case — auth bounced. Send the user back to /account where the
     * "sign in" affordance lives; the regular sign-out / sign-in flow is
     * the right place to handle it, not the wizard. */
    return (
      <div className={styles.app}>
        <Header homeHref={homeHref} />
        <main id="content" tabIndex={-1} className={styles.main}>
          <p className={styles.signedOut}>
            <a className={styles.signedOutLink} href={accountHref}>
              {t('setup.needSignIn')}
            </a>
          </p>
        </main>
      </div>
    );
  }

  const username = sessionUser.username?.trim() || '';
  const goNext = () => setStep((s) => (s != null && s < 4 ? ((s + 1) as Step) : 4));
  const goBack = () => setStep((s) => (s != null && s > 1 ? ((s - 1) as Step) : 1));
  const skipToAccount = () => {
    window.location.href = accountHref;
  };

  return (
    <div className={styles.app}>
      <Header homeHref={homeHref} />
      <main id="content" tabIndex={-1} className={styles.main}>
        <ProgressDots current={step} total={4} />
        {step === 1 && (
          <UsernameStep
            initialUsername={username}
            onSaved={() => {
              void refetch();
              goNext();
            }}
            onSkip={skipToAccount}
          />
        )}
        {step === 2 && (
          <HomeBaseStep
            initialAddress={sessionUser.homeBaseAddress ?? ''}
            onSaved={() => {
              void refetch();
              goNext();
            }}
            onBack={goBack}
            onSkip={skipToAccount}
          />
        )}
        {step === 3 && (
          <AvailabilityStep
            initialAvailability={sessionUser.availabilitySlots ?? '{}'}
            onSaved={() => {
              void refetch();
              goNext();
            }}
            onBack={goBack}
            onSkip={skipToAccount}
          />
        )}
        {step === 4 && <DoneStep username={username} accountHref={accountHref} />}
      </main>
    </div>
  );
}

function determineStep(user: SessionUserView): Step {
  if (!user.username?.trim()) return 1;
  if (!user.homeBaseAddress?.trim()) return 2;
  /* Step 3 is "set availability" — but a missing or empty schedule on
   * a fresh account is fine; we treat anything other than the defaulted
   * empty `{}` as "user has touched it". This keeps the wizard from
   * trapping users who skipped this step earlier. */
  let hasSchedule = false;
  try {
    const parsed = JSON.parse(user.availabilitySlots ?? '{}');
    if (parsed && typeof parsed === 'object') {
      hasSchedule = Object.values(parsed).some(
        (d): d is { enabled?: boolean } =>
          !!d && typeof d === 'object' && (d as { enabled?: boolean }).enabled === true,
      );
    }
  } catch {
    /* malformed → treat as not-set, land on step 3 */
  }
  if (!hasSchedule) return 3;
  return 4;
}

/* ────────── Header (slim, brand-only — no full nav) ────────── */

function Header({ homeHref }: { homeHref: string }) {
  const { t } = useI18n();
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a className={styles.logo} href={homeHref} aria-label={t('app.logoAlt')}>
          <span className={styles.logoWordmark}>ACoffee</span>
        </a>
        {import.meta.env.VITE_AUTH_ENABLED === 'true' ? (
          <Suspense fallback={null}>
            <AccountMenu />
          </Suspense>
        ) : null}
      </div>
    </header>
  );
}

/* ────────── Progress dots ────────── */

function ProgressDots({ current, total }: { current: Step; total: number }) {
  return (
    <div className={styles.progress} aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <span
          key={n}
          className={`${styles.dot}${n === current ? ' ' + styles.dotActive : ''}${
            n < current ? ' ' + styles.dotDone : ''
          }`}
          aria-hidden
        />
      ))}
    </div>
  );
}

/* ────────── Step 1 — Username ────────── */

function UsernameStep({
  initialUsername,
  onSaved,
  onSkip,
}: {
  initialUsername: string;
  onSaved: () => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialUsername);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const trimmed = value.trim().toLowerCase();
  const validFormat = /^[a-z][a-z0-9_-]{2,29}$/.test(trimmed);
  const canSubmit = save.kind !== 'saving' && validFormat;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSave({ kind: 'saving' });
    try {
      const res = await fetch('/api/account/username', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: trimmed }),
      });
      if (!res.ok) {
        let message = t('account.usernameSaveFailed');
        const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
        if (res.status === 409) message = t('account.usernameTaken');
        else if (res.status === 400) {
          message =
            body.reason === 'reserved'
              ? t('account.usernameReserved')
              : t('account.usernameInvalid');
        } else if (body.error) message = body.error;
        setSave({ kind: 'error', message });
        return;
      }
      setSave({ kind: 'saved' });
      onSaved();
    } catch {
      setSave({ kind: 'error', message: t('account.usernameSaveFailed') });
    }
  }

  return (
    <form className={styles.stepCard} onSubmit={handleSubmit}>
      <h1 className={styles.stepTitle}>{t('setup.usernameTitle')}</h1>
      <p className={styles.stepLead}>{t('setup.usernameLead')}</p>
      <label className={styles.inputRow}>
        <span className={styles.inputPrefix}>acoffee.com/</span>
        <input
          className={styles.input}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="yourname"
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={30}
        />
      </label>
      <p className={styles.hint}>{t('setup.usernameHint')}</p>
      {save.kind === 'error' ? (
        <p className={styles.error} role="alert">{save.message}</p>
      ) : null}
      <Footer
        primary={t(save.kind === 'saving' ? 'setup.saving' : 'setup.continue')}
        primaryDisabled={!canSubmit}
        onSkip={onSkip}
      />
    </form>
  );
}

/* ────────── Step 2 — Home base address ────────── */

function HomeBaseStep({
  initialAddress,
  onSaved,
  onBack,
  onSkip,
}: {
  initialAddress: string;
  onSaved: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialAddress);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const trimmed = value.trim();
  const canSubmit = save.kind !== 'saving' && trimmed.length >= 3;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSave({ kind: 'saving' });
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ homeBaseAddress: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSave({ kind: 'error', message: body.error ?? t('setup.homeBaseSaveFailed') });
        return;
      }
      setSave({ kind: 'saved' });
      onSaved();
    } catch {
      setSave({ kind: 'error', message: t('setup.homeBaseSaveFailed') });
    }
  }

  return (
    <form className={styles.stepCard} onSubmit={handleSubmit}>
      <h1 className={styles.stepTitle}>{t('setup.homeBaseTitle')}</h1>
      <p className={styles.stepLead}>{t('setup.homeBaseLead')}</p>
      <label className={styles.inputLabel}>
        <span className={styles.inputLabelText}>{t('setup.homeBaseLabel')}</span>
        <input
          className={styles.input}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('setup.homeBasePlaceholder')}
          autoFocus
          maxLength={200}
        />
      </label>
      <p className={styles.hint}>{t('setup.homeBaseHint')}</p>
      {save.kind === 'error' ? (
        <p className={styles.error} role="alert">{save.message}</p>
      ) : null}
      <Footer
        primary={t(save.kind === 'saving' ? 'setup.saving' : 'setup.continue')}
        primaryDisabled={!canSubmit}
        onBack={onBack}
        onSkip={onSkip}
      />
    </form>
  );
}

/* ────────── Step 3 — Availability preset ────────── */

function AvailabilityStep({
  initialAvailability,
  onSaved,
  onBack,
  onSkip,
}: {
  initialAvailability: string;
  onSaved: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  /* Detect which preset (if any) the user already has. Defaults to
   * weekday so a fresh user can hit Continue immediately. */
  const initialPreset = useMemo<'weekday' | 'anytime'>(() => {
    if (initialAvailability === PRESET_ANYTIME) return 'anytime';
    return 'weekday';
  }, [initialAvailability]);
  const [preset, setPreset] = useState(initialPreset);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (save.kind === 'saving') return;
    setSave({ kind: 'saving' });
    try {
      const slotsJson = preset === 'anytime' ? PRESET_ANYTIME : PRESET_WEEKDAY;
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ availabilitySlots: JSON.parse(slotsJson) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSave({
          kind: 'error',
          message: body.error ?? t('setup.availabilitySaveFailed'),
        });
        return;
      }
      setSave({ kind: 'saved' });
      onSaved();
    } catch {
      setSave({ kind: 'error', message: t('setup.availabilitySaveFailed') });
    }
  }

  return (
    <form className={styles.stepCard} onSubmit={handleSubmit}>
      <h1 className={styles.stepTitle}>{t('setup.availabilityTitle')}</h1>
      <p className={styles.stepLead}>{t('setup.availabilityLead')}</p>
      <fieldset className={styles.presetGroup}>
        <legend className={styles.srOnly}>{t('setup.availabilityTitle')}</legend>
        <PresetOption
          id="preset-weekday"
          checked={preset === 'weekday'}
          onChange={() => setPreset('weekday')}
          title={t('setup.presetWeekdayTitle')}
          subtitle={t('setup.presetWeekdaySub')}
        />
        <PresetOption
          id="preset-anytime"
          checked={preset === 'anytime'}
          onChange={() => setPreset('anytime')}
          title={t('setup.presetAnytimeTitle')}
          subtitle={t('setup.presetAnytimeSub')}
        />
      </fieldset>
      <p className={styles.hint}>{t('setup.availabilityHint')}</p>
      {save.kind === 'error' ? (
        <p className={styles.error} role="alert">{save.message}</p>
      ) : null}
      <Footer
        primary={t(save.kind === 'saving' ? 'setup.saving' : 'setup.continue')}
        onBack={onBack}
        onSkip={onSkip}
      />
    </form>
  );
}

function PresetOption({
  id,
  checked,
  onChange,
  title,
  subtitle,
}: {
  id: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <label className={`${styles.preset}${checked ? ' ' + styles.presetActive : ''}`} htmlFor={id}>
      <input
        id={id}
        type="radio"
        name="preset"
        checked={checked}
        onChange={onChange}
        className={styles.presetRadio}
      />
      <div className={styles.presetCopy}>
        <span className={styles.presetTitle}>{title}</span>
        <span className={styles.presetSubtitle}>{subtitle}</span>
      </div>
    </label>
  );
}

/* ────────── Step 4 — Done ────────── */

function DoneStep({ username, accountHref }: { username: string; accountHref: string }) {
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    },
    [],
  );
  const profileHref = username ? buildLocalizedPathname(`/${username}`, locale) : '/';
  const shareUrl = `https://acoffee.com/${username}`;

  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard;
  async function handleCopy() {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  }

  return (
    <section className={styles.stepCard}>
      <div className={styles.doneBadge} aria-hidden>☕</div>
      <h1 className={styles.stepTitle}>{t('setup.doneTitle')}</h1>
      <p className={styles.stepLead}>{t('setup.doneLead')}</p>
      <div className={styles.shareBox}>
        <span className={styles.shareUrl}>{shareUrl}</span>
        {canCopy ? (
          <button
            type="button"
            className={`${styles.shareCopy}${copied ? ' ' + styles.shareCopyCopied : ''}`}
            onClick={() => void handleCopy()}
          >
            {copied ? t('setup.copied') : t('setup.copyLink')}
          </button>
        ) : null}
      </div>
      <div className={styles.doneActions}>
        <a className={styles.donePrimary} href={profileHref}>
          {t('setup.viewProfile')} →
        </a>
        <a className={styles.doneSecondary} href={accountHref}>
          {t('setup.goToSettings')}
        </a>
      </div>
    </section>
  );
}

/* ────────── Footer (Skip / Back / Continue) ────────── */

function Footer({
  primary,
  primaryDisabled,
  onBack,
  onSkip,
}: {
  primary: string;
  primaryDisabled?: boolean;
  onBack?: () => void;
  onSkip?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className={styles.footer}>
      <div className={styles.footerLeft}>
        {onBack ? (
          <button type="button" className={styles.footerLink} onClick={onBack}>
            {t('setup.back')}
          </button>
        ) : null}
        {onSkip ? (
          <button type="button" className={styles.footerLink} onClick={onSkip}>
            {t('setup.skipAll')}
          </button>
        ) : null}
      </div>
      <button type="submit" className={styles.footerPrimary} disabled={primaryDisabled}>
        {primary}
      </button>
    </div>
  );
}
