import { useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import styles from './ProposalPage.module.css';

interface ProposalView {
  id: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
  scheduledAt: number;
  expiresAt: number;
  mode: 'fair' | 'fast' | 'vibe' | 'quiet' | 'cheap' | 'now';
  addresses: string[];
  cafe: {
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
  };
  altCount: number;
  cafeIndex: number;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; data: ProposalView }
  | { kind: 'error'; message: string };

interface Props {
  id: string;
}

const MODE_ICONS: Record<ProposalView['mode'], string> = {
  fair: '🤝',
  fast: '⚡',
  vibe: '✨',
  quiet: '🌙',
  cheap: '💸',
  now: '🕐',
};

/**
 * Visitor-side proposal page: receiver gets a `/p/<id>` link, opens
 * it, sees the auto-picked café + suggested time + a few one-tap
 * tweak buttons (later / earlier / next café / accept). All actions
 * mutate the same proposal id — no extra accounts, no email.
 *
 * The id is the secret (UUID v4 = 122 bits); we don't HMAC-sign on
 * top of that. Threat model is roughly "if the link leaks, the
 * receiver can change the time or the café — the original
 * commitment was to *that conversation*, not a specific row."
 */
export function ProposalPage({ id }: Props) {
  const { t, locale } = useI18n();
  const homeHref = buildLocalizedPathname('/', locale);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/proposals/${encodeURIComponent(id)}`);
        if (cancelled) return;
        if (r.status === 404) {
          setPhase({ kind: 'error', message: t('proposal.notFound') });
          return;
        }
        if (!r.ok) {
          setPhase({ kind: 'error', message: t('proposal.loadFailed') });
          return;
        }
        const data = (await r.json()) as ProposalView;
        setPhase({ kind: 'ready', data });
      } catch {
        if (!cancelled) setPhase({ kind: 'error', message: t('proposal.loadFailed') });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  const dispatch = async (
    action: { action: 'accept' | 'next-cafe' } | { action: 'shift-time'; minutes: number },
  ) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/proposals/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setPhase({ kind: 'error', message: j.error ?? t('proposal.actionFailed') });
        return;
      }
      const data = (await r.json()) as ProposalView;
      setPhase({ kind: 'ready', data });
    } catch {
      setPhase({ kind: 'error', message: t('proposal.actionFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.logo} href={homeHref}>ACoffee</a>
        </div>
      </header>
      <main className={styles.main}>
        {phase.kind === 'loading' ? (
          <section className={styles.card} aria-busy="true">
            <div className={styles.lead}>{t('proposal.loading')}</div>
          </section>
        ) : phase.kind === 'error' ? (
          <section className={styles.card}>
            <div className={styles.errorBox}>
              <div className={styles.errorEmoji} aria-hidden>☕</div>
              <p>{phase.message}</p>
              <a className={styles.errorCta} href={homeHref}>
                {t('proposal.goHome')}
              </a>
            </div>
          </section>
        ) : (
          <ProposalCard
            data={phase.data}
            locale={locale}
            t={t}
            busy={busy}
            onAccept={() => void dispatch({ action: 'accept' })}
            onNextCafe={() => void dispatch({ action: 'next-cafe' })}
            onLater={() => void dispatch({ action: 'shift-time', minutes: 30 })}
            onEarlier={() => void dispatch({ action: 'shift-time', minutes: -30 })}
          />
        )}
      </main>
    </div>
  );
}

interface CardProps {
  data: ProposalView;
  locale: string;
  t: ReturnType<typeof useI18n>['t'];
  busy: boolean;
  onAccept: () => void;
  onNextCafe: () => void;
  onLater: () => void;
  onEarlier: () => void;
}

function ProposalCard({ data, locale, t, busy, onAccept, onNextCafe, onLater, onEarlier }: CardProps) {
  const start = new Date(data.scheduledAt);
  const when = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(start);
  const mapsHref = `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(data.cafe.placeId)}`;

  if (data.status === 'expired') {
    return (
      <section className={styles.card}>
        <div className={styles.errorBox}>
          <div className={styles.errorEmoji} aria-hidden>☕</div>
          <p>{t('proposal.expired')}</p>
        </div>
      </section>
    );
  }
  if (data.status === 'cancelled') {
    return (
      <section className={styles.card}>
        <div className={styles.errorBox}>
          <div className={styles.errorEmoji} aria-hidden>☕</div>
          <p>{t('proposal.cancelled')}</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <p className={styles.lead}>{t('proposal.lead')}</p>
      <h1 className={styles.title}>{t('proposal.title')}</h1>

      <span className={styles.modeChip} aria-label={t(`agentMode.${data.mode}.label`)}>
        {MODE_ICONS[data.mode]} {t(`agentMode.${data.mode}.label`)}
      </span>

      <div className={styles.cafeBlock}>
        <p className={styles.cafeName}>{data.cafe.name}</p>
        <p className={styles.cafeAddress}>{data.cafe.address}</p>
        <a className={styles.mapsLink} href={mapsHref} target="_blank" rel="noreferrer">
          {t('proposal.openInMaps')} →
        </a>
      </div>

      <p className={styles.timeRow}>
        <span className={styles.timeIcon} aria-hidden>🕐</span>
        <span className={styles.timeLabel}>{when}</span>
      </p>

      {data.status === 'accepted' ? (
        <div className={styles.acceptedBox}>
          <p className={styles.acceptedTitle}>{t('proposal.acceptedTitle')}</p>
          <p className={styles.acceptedBody}>{t('proposal.acceptedBody')}</p>
        </div>
      ) : (
        <>
          <button
            type="button"
            className={styles.btnAccept}
            onClick={onAccept}
            disabled={busy}
          >
            {busy ? t('proposal.busy') : t('proposal.accept')}
          </button>
          <div className={styles.actions}>
            <button type="button" className={styles.btn} onClick={onEarlier} disabled={busy}>
              {t('proposal.earlier')}
            </button>
            <button type="button" className={styles.btn} onClick={onLater} disabled={busy}>
              {t('proposal.later')}
            </button>
            {data.altCount > 1 ? (
              <button
                type="button"
                className={styles.btn}
                onClick={onNextCafe}
                disabled={busy}
                style={{ gridColumn: 'span 2' }}
              >
                {t('proposal.nextCafe', {
                  current: data.cafeIndex + 1,
                  total: data.altCount,
                })}
              </button>
            ) : null}
          </div>
          <p className={styles.note}>{t('proposal.note')}</p>
        </>
      )}
    </section>
  );
}
