import { useI18n } from '../context/I18nContext';
import { useSession } from '../utils/authClient';
import styles from './HomeFeatureShowcase.module.css';

/**
 * Anonymous home hero. Single block: eyebrow + H1 + lead + MockAgent
 * SVG. Under the 2026-05 utility pivot the page no longer markets
 * adjacent product surfaces (the 5-card secondary grid was removed
 * first) and no longer recruits visitors into the paused Pro tier
 * (the "claim acoffee.com/yourname" CTA was the most recent removal).
 *
 * Hidden for signed-in users (their return visit is tool-first), and
 * naturally hidden during search since AppHero self-hides then.
 */
export function HomeFeatureShowcase() {
  const { t } = useI18n();
  const { data: session, isPending } = useSession();

  if (isPending) return null;
  if (session?.user) return null;

  return (
    <section className={styles.wrap} aria-labelledby="showcase-title">
      <div className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>
            {t('showcase.eyebrowAi')} · {t('showcase.eyebrowFree')} ·{' '}
            <a
              className={styles.eyebrowLink}
              href="https://github.com/nomadcafe/acoffeecom"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('showcase.eyebrowOpenSource')}
            </a>
          </span>
          <h1 id="showcase-title" className={styles.title}>
            {t('showcase.title')}
          </h1>
          <p className={styles.lead}>{t('showcase.lead')}</p>
        </div>
        <div className={styles.heroVisual}>
          <MockAgent />
        </div>
      </div>
    </section>
  );
}

/* ────────── Hero visual (AI agent picking a café) ────────── */

function MockAgent() {
  const { t } = useI18n();
  return (
    <svg
      className={styles.mockAgent}
      viewBox="0 0 480 280"
      role="img"
      aria-label={t('showcase.demoAria')}
    >
      <defs>
        <radialGradient id="ac-cafe-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6f4e37" stopOpacity="0.28" />
          <stop offset="60%" stopColor="#6f4e37" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#6f4e37" stopOpacity="0" />
        </radialGradient>
        <filter id="ac-cafe-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#6f4e37" floodOpacity="0.18" />
        </filter>
      </defs>
      <g stroke="#6f4e37" strokeOpacity="0.32" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" fill="none">
        <line x1="80" y1="60" x2="240" y2="150" />
        <line x1="400" y1="60" x2="240" y2="150" />
        <line x1="240" y1="240" x2="240" y2="150" />
      </g>
      <circle cx="240" cy="150" r="68" fill="url(#ac-cafe-glow)" />
      <g filter="url(#ac-cafe-shadow)">
        <circle cx="240" cy="150" r="32" fill="#ffffff" stroke="#6f4e37" strokeWidth="2.5" />
      </g>
      <text x="240" y="150" textAnchor="middle" dominantBaseline="central" fontSize="30">☕</text>
      <PartyDot cx={80} cy={60} color="#1a73e8" letter="A" />
      <PartyDot cx={400} cy={60} color="#34a853" letter="B" />
      <PartyDot cx={240} cy={240} color="#f4a623" letter="C" />
      <g transform="translate(296 116)">
        <rect width="92" height="24" rx="12" fill="#6f4e37" />
        <text x="46" y="12" textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="11" fontWeight="600">
          {t('showcase.demoBadge')}
        </text>
      </g>
    </svg>
  );
}

function PartyDot({ cx, cy, color, letter }: { cx: number; cy: number; color: string; letter: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="20" fill="#ffffff" stroke={color} strokeWidth="3" />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="700" fill={color}>
        {letter}
      </text>
    </g>
  );
}
