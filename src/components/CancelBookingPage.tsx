import { useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import styles from './CancelBookingPage.module.css';

interface CancelResponse {
  ok: true;
  alreadyCancelled?: boolean;
  hostHandle: string;
  startedAt: number;
  /** Null while the booking was still in unconfirmed/requested state —
   *  the host hadn't picked a café yet, so there's no name to show. */
  cafeName: string | null;
}

type Phase =
  | { kind: 'confirm' }
  | { kind: 'submitting' }
  | { kind: 'done'; result: CancelResponse }
  | { kind: 'error'; message: string };

/**
 * Standalone page reached from the cancel link in the visitor's
 * confirmation email. The page reads `id` and `t` from the query string
 * (no DB read until the visitor confirms — so a mail-provider link
 * preview can't accidentally cancel anything), shows a single-step
 * confirmation, and POSTs to /api/booking/cancel-public.
 *
 * On success we show what was cancelled — useful when the same user opens
 * an old link out of curiosity and wants to see "yes this was the one I
 * already cancelled."
 */
export function CancelBookingPage() {
  const { t, locale } = useI18n();
  const homeHref = buildLocalizedPathname('/', locale);

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') ?? '';
  const token = params.get('t') ?? '';

  const [phase, setPhase] = useState<Phase>({ kind: 'confirm' });

  const handleConfirm = async () => {
    setPhase({ kind: 'submitting' });
    try {
      const r = await fetch('/api/booking/cancel-public', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, token }),
      });
      const json = (await r.json().catch(() => ({}))) as Partial<CancelResponse> & {
        error?: string;
      };
      if (!r.ok || !json.ok) {
        setPhase({ kind: 'error', message: json.error ?? t('cancel.failed') });
        return;
      }
      setPhase({ kind: 'done', result: json as CancelResponse });
    } catch {
      setPhase({ kind: 'error', message: t('cancel.failed') });
    }
  };

  // Missing query params → friendly error rather than a confirm page that
  // would then 400 on POST.
  const linkOk = id.length > 0 && token.length > 0;

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.logo} href={homeHref}>ACoffee</a>
        </div>
      </header>
      <main className={styles.main}>
        {!linkOk ? (
          <section className={styles.card}>
            <h1 className={styles.title}>{t('cancel.linkInvalidTitle')}</h1>
            <p className={styles.body}>{t('cancel.linkInvalidBody')}</p>
            <a className={styles.back} href={homeHref}>
              {t('cancel.goHome')}
            </a>
          </section>
        ) : phase.kind === 'done' ? (
          <section className={styles.card}>
            <div className={styles.successEmoji} aria-hidden>☕</div>
            <h1 className={styles.title}>
              {phase.result.alreadyCancelled
                ? t('cancel.alreadyCancelledTitle')
                : t('cancel.doneTitle')}
            </h1>
            <p className={styles.body}>
              {t(
                phase.result.cafeName ? 'cancel.doneBody' : 'cancel.doneBodyNoCafe',
                {
                  handle: phase.result.hostHandle,
                  cafe: phase.result.cafeName ?? '',
                  when: new Intl.DateTimeFormat(locale, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(new Date(phase.result.startedAt)),
                },
              )}
            </p>
            <a className={styles.successCta} href={homeHref}>
              {t('cancel.goHome')}
            </a>
          </section>
        ) : (
          <section className={styles.card}>
            <h1 className={styles.title}>{t('cancel.title')}</h1>
            <p className={styles.body}>{t('cancel.body')}</p>
            {phase.kind === 'error' ? (
              <p className={styles.error}>{phase.message}</p>
            ) : null}
            <div className={styles.actions}>
              <a className={styles.back} href={homeHref}>
                {t('cancel.keep')}
              </a>
              <button
                type="button"
                className={styles.confirm}
                onClick={() => void handleConfirm()}
                disabled={phase.kind === 'submitting'}
              >
                {phase.kind === 'submitting' ? t('cancel.cancelling') : t('cancel.confirm')}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
