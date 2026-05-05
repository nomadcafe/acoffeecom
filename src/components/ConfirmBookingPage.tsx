import { useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import styles from './CancelBookingPage.module.css';

interface ConfirmResponse {
  ok: true;
  alreadyConfirmed?: boolean;
  hostHandle: string;
  startedAt: number;
}

type Phase =
  | { kind: 'submitting' }
  | { kind: 'done'; result: ConfirmResponse }
  | { kind: 'error'; message: string }
  /* Server reports the host already actioned this booking (rejected or
   * cancelled). Distinct from a generic error so we can render the
   * right "the host said no / this was cancelled" copy instead of
   * "request submitted". `hostHandle` echoed when available so the
   * message can name the host. */
  | { kind: 'terminal'; status: 'cancelled' | 'rejected'; hostHandle: string | null }
  | { kind: 'invalid' };

/**
 * Visitor's double-opt-in confirmation page. The link in their first
 * email points here with `id` and `t` query params; we POST immediately
 * (no extra click needed — they already clicked the link, that *is* the
 * confirmation). On success the booking flips from 'unconfirmed' to
 * 'pending' server-side, and both sides get the calendar invite.
 *
 * Reuses CancelBookingPage's CSS module for visual parity — same shell,
 * same card, just different copy + sage success styling.
 */
export function ConfirmBookingPage() {
  const { t, locale } = useI18n();
  const homeHref = buildLocalizedPathname('/', locale);

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') ?? '';
  const token = params.get('t') ?? '';

  const initial: Phase =
    !id || !token ? { kind: 'invalid' } : { kind: 'submitting' };
  const [phase, setPhase] = useState<Phase>(initial);

  useEffect(() => {
    if (phase.kind !== 'submitting') return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/booking/confirm-public', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, token }),
        });
        if (cancelled) return;
        const json = (await r.json().catch(() => ({}))) as Partial<ConfirmResponse> & {
          error?: string;
          /* Server now returns code='cancelled' or 'rejected' (with
           * hostHandle) on terminal-state confirms instead of a fake
           * success. Distinguishes them from generic errors. */
          code?: 'cancelled' | 'rejected';
          hostHandle?: string;
        };
        if (!r.ok || !json.ok) {
          if (json.code === 'cancelled' || json.code === 'rejected') {
            setPhase({
              kind: 'terminal',
              status: json.code,
              hostHandle: json.hostHandle ?? null,
            });
            return;
          }
          setPhase({ kind: 'error', message: json.error ?? t('confirmPage.failed') });
          return;
        }
        setPhase({ kind: 'done', result: json as ConfirmResponse });
      } catch {
        if (!cancelled) setPhase({ kind: 'error', message: t('confirmPage.failed') });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Phase changes from submitting are terminal — re-running on phase
    // change would loop. Token + id are stable for the page lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.logo} href={homeHref}>ACoffee</a>
        </div>
      </header>
      <main className={styles.main}>
        {phase.kind === 'invalid' ? (
          <section className={styles.card}>
            <h1 className={styles.title}>{t('confirmPage.linkInvalidTitle')}</h1>
            <p className={styles.body}>{t('confirmPage.linkInvalidBody')}</p>
            <a className={styles.back} href={homeHref}>{t('confirmPage.goHome')}</a>
          </section>
        ) : phase.kind === 'submitting' ? (
          <section className={styles.card} aria-busy="true">
            <h1 className={styles.title}>{t('confirmPage.submittingTitle')}</h1>
            <p className={styles.body}>{t('confirmPage.submittingBody')}</p>
          </section>
        ) : phase.kind === 'error' ? (
          <section className={styles.card}>
            <h1 className={styles.title}>{t('confirmPage.errorTitle')}</h1>
            <p className={styles.body}>{phase.message}</p>
            <a className={styles.back} href={homeHref}>{t('confirmPage.goHome')}</a>
          </section>
        ) : phase.kind === 'terminal' ? (
          <section className={styles.card}>
            <h1 className={styles.title}>
              {t(
                phase.status === 'cancelled'
                  ? 'confirmPage.terminalCancelledTitle'
                  : 'confirmPage.terminalRejectedTitle',
              )}
            </h1>
            <p className={styles.body}>
              {t(
                phase.status === 'cancelled'
                  ? 'confirmPage.terminalCancelledBody'
                  : 'confirmPage.terminalRejectedBody',
                { handle: phase.hostHandle ?? '' },
              )}
            </p>
            <a className={styles.back} href={homeHref}>{t('confirmPage.goHome')}</a>
          </section>
        ) : (
          <section className={styles.card}>
            <div className={styles.successEmoji} aria-hidden>☕</div>
            <h1 className={styles.title}>
              {phase.result.alreadyConfirmed
                ? t('confirmPage.alreadyTitle')
                : t('confirmPage.doneTitle')}
            </h1>
            <p className={styles.body}>
              {t('confirmPage.doneBody', {
                handle: phase.result.hostHandle,
                when: new Intl.DateTimeFormat(locale, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(new Date(phase.result.startedAt)),
              })}
            </p>
            <a className={styles.successCta} href={homeHref}>
              {t('confirmPage.goHome')}
            </a>
          </section>
        )}
      </main>
    </div>
  );
}
