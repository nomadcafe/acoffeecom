import { lazy, Suspense, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../context/I18nContext';
import { useSession } from '../utils/authClient';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { ACCOUNT_PATH } from '../routes';
import styles from './HomeFeatureShowcase.module.css';

// AuthModal pulls in @better-auth/client + magic-link UI; only anonymous
// visitors who tap the hero CTA pay the chunk cost.
const AuthModal = lazy(() => import('./AuthModal').then((m) => ({ default: m.AuthModal })));

/**
 * Hero feature showcase — one bold marquee block (the AI agent picking a
 * café) plus a static grid of secondary features. Used to be a 6-slide
 * auto-advancing carousel; the carousel was the dominant "looks dated"
 * signal on the homepage so we replaced it with this single-frame layout
 * inspired by modern landing pages.
 *
 * Hidden for signed-in users (their return visit is tool-first), and
 * naturally hidden during search since AppHero self-hides then.
 */

const MODE_CHIPS = [
  { emoji: '🤝', labelKey: 'agentMode.fair.label' },
  { emoji: '⚡', labelKey: 'agentMode.fast.label' },
  { emoji: '✨', labelKey: 'agentMode.vibe.label' },
  { emoji: '🌙', labelKey: 'agentMode.quiet.label' },
  { emoji: '💸', labelKey: 'agentMode.cheap.label' },
  { emoji: '🕐', labelKey: 'agentMode.now.label' },
];

interface SecondaryFeature {
  id: string;
  eyebrowKey: string;
  titleKey: string;
  bodyKey: string;
  mock: ReactNode;
}

export function HomeFeatureShowcase() {
  const { t } = useI18n();
  const { data: session, isPending } = useSession();

  if (isPending) return null;
  if (session?.user) return null;

  const secondary: SecondaryFeature[] = [
    { id: 'passport', eyebrowKey: 'showcase.passportEyebrow', titleKey: 'showcase.row2Title', bodyKey: 'showcase.row2Body', mock: <MockPassport /> },
    { id: 'profile', eyebrowKey: 'showcase.profileEyebrow', titleKey: 'showcase.row3Title', bodyKey: 'showcase.row3Body', mock: <MockProfile /> },
    { id: 'booking', eyebrowKey: 'showcase.bookingEyebrow', titleKey: 'showcase.row4Title', bodyKey: 'showcase.row4Body', mock: <MockBooking /> },
    { id: 'proposal', eyebrowKey: 'showcase.proposalEyebrow', titleKey: 'showcase.row5Title', bodyKey: 'showcase.row5Body', mock: <MockProposal /> },
    { id: 'owner', eyebrowKey: 'showcase.featuredCafeEyebrow', titleKey: 'showcase.row6Title', bodyKey: 'showcase.row6Body', mock: <MockOwnerCafe /> },
  ];

  return (
    <section className={styles.wrap} aria-labelledby="showcase-title">
      <div className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>{t('showcase.eyebrow')}</span>
          <h1 id="showcase-title" className={styles.title}>
            {t('showcase.title')}
          </h1>
          <p className={styles.lead}>{t('showcase.lead')}</p>
          <ProfileClaimCta />
          <div className={styles.modeStrip} aria-label={t('agentMode.aria')}>
            {MODE_CHIPS.map((m) => (
              <span key={m.labelKey} className={styles.modeChip}>
                <span aria-hidden>{m.emoji}</span>
                <span>{t(m.labelKey)}</span>
              </span>
            ))}
          </div>
        </div>
        <div className={styles.heroVisual}>
          <MockAgent />
        </div>
      </div>

      <ul className={styles.featureGrid} aria-label={t('showcase.featuresGridAria')}>
        {secondary.map((f) => (
          <li key={f.id} className={styles.featureCard}>
            <div className={styles.featureMock}>{f.mock}</div>
            <span className={styles.featureEyebrow}>{t(f.eyebrowKey)}</span>
            <h2 className={styles.featureTitle}>{t(f.titleKey)}</h2>
            <p className={styles.featureBody}>{t(f.bodyKey)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ────────── Hero CTA ────────── */

/**
 * Page-level "Claim acoffee.com/yourname" CTA. Lifted from the old profile
 * slide to be the homepage's primary action. Opens AuthModal; after
 * sign-in lands on `/account?focus=username` so AccountPage scrolls to and
 * focuses the slug picker.
 *
 * Auth gate / signed-in suppression: HomeFeatureShowcase already returns
 * null for signed-in users, so the CTA is auto-hidden for them. We still
 * need the build-flag gate so the modal isn't a dead-end when auth is
 * disabled.
 */
function ProfileClaimCta() {
  const { t, locale } = useI18n();
  const [modalOpen, setModalOpen] = useState(false);

  if (import.meta.env.VITE_AUTH_ENABLED !== 'true') return null;

  const callbackURL = `${buildLocalizedPathname(ACCOUNT_PATH, locale)}?focus=username`;

  return (
    <>
      <button
        type="button"
        className={styles.heroCta}
        onClick={() => setModalOpen(true)}
        aria-label={t('homeCta.aria')}
      >
        <span className={styles.heroCtaIcon} aria-hidden>
          ☕
        </span>
        <span className={styles.heroCtaCopy}>
          <span className={styles.heroCtaLead}>{t('homeCta.lead')}</span>
          <span className={styles.heroCtaUrl}>
            acoffee.com/
            <span className={styles.heroCtaSlug}>{t('homeCta.slugPlaceholder')}</span>
          </span>
        </span>
        <span className={styles.heroCtaArrow} aria-hidden>
          →
        </span>
      </button>
      {modalOpen ? (
        <Suspense fallback={null}>
          <AuthModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            callbackURL={callbackURL}
          />
        </Suspense>
      ) : null}
    </>
  );
}

/* ────────── Mocks (unchanged from carousel version) ────────── */

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

function MockPassport() {
  const { t } = useI18n();
  const stamps = [
    { emoji: '☕', name: 'Blue Bottle', city: 'Tokyo' },
    { emoji: '🥐', name: 'Café de Flore', city: 'Paris' },
    { emoji: '☕', name: '% Arabica', city: 'Kyoto' },
    { emoji: '🍵', name: 'Mariage Frères', city: 'Tokyo' },
  ];
  return (
    <div className={styles.mockPassport}>
      <div className={styles.passportHeader}>
        <span className={styles.passportTitle}>{t('showcase.passportMockTitle')}</span>
        <span className={styles.passportStreak}>🔥 12-day streak</span>
      </div>
      <div className={styles.passportGrid}>
        {stamps.map((s) => (
          <div key={s.name} className={styles.passportStamp}>
            <span className={styles.passportStampIcon} aria-hidden>{s.emoji}</span>
            <div className={styles.passportStampMeta}>
              <strong>{s.name}</strong>
              <span>{s.city}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockProfile() {
  const { t } = useI18n();
  return (
    <div className={styles.mockProfile}>
      <div className={styles.profileAvatar}>H</div>
      <div className={styles.profileName}>Hello</div>
      <div className={styles.profileHandle}>@hello · acoffee.com/hello</div>
      <div className={styles.profileBio}>{t('showcase.mock.profileBio')}</div>
      <div className={styles.profileFeatured}>
        <span aria-hidden>📍</span>
        <span><strong>Blue Bottle</strong> · Shibuya, Tokyo</span>
      </div>
      <div className={styles.profileLinks}>
        <span>🔗 {t('showcase.mock.linkSite')}</span>
        <span>🐦 X</span>
        <span>📷 IG</span>
      </div>
    </div>
  );
}

function MockBooking() {
  return (
    <div className={styles.mockBooking}>
      <div className={styles.bookingHeader}>
        <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span>
      </div>
      <div className={styles.bookingGrid}>
        {[
          [false, true, false, true, false],
          [false, true, true, false, true],
          [true, false, true, false, false],
        ].map((row, ri) => (
          <div key={ri} className={styles.bookingRow}>
            {row.map((open, ci) => (
              <span key={ci} className={`${styles.bookingCell} ${open ? styles.bookingCellOpen : ''}`} aria-hidden>
                {open ? '✓' : ''}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className={styles.bookingPills}>
        <span>2:00 PM</span>
        <span>3:30 PM</span>
        <span>5:00 PM</span>
      </div>
    </div>
  );
}

function MockProposal() {
  const { t } = useI18n();
  return (
    <div className={styles.mockProposal}>
      <span className={styles.proposalEyebrow}>{t('showcase.mock.proposalEyebrow')}</span>
      <div className={styles.proposalHeadline}>
        ☕ <strong>{t('showcase.mock.proposalHeadline')}</strong>
      </div>
      <div className={styles.proposalMeta}>{t('showcase.mock.proposalMeta')}</div>
      <div className={styles.proposalActions}>
        <button type="button" disabled className={`${styles.proposalBtn} ${styles.proposalBtnPrimary}`}>{t('showcase.mock.proposalOk')}</button>
        <button type="button" disabled className={styles.proposalBtn}>{t('showcase.mock.proposalDifferent')}</button>
        <button type="button" disabled className={styles.proposalBtn}>{t('showcase.mock.proposalLater')}</button>
      </div>
    </div>
  );
}

function MockOwnerCafe() {
  const { t } = useI18n();
  return (
    <div className={styles.mockOwnerCafe}>
      <div className={styles.ownerCafeHeader}>
        <strong>Blue Bottle Coffee Kyoto</strong>
        <span className={styles.ownerCafeRating}>★ 4.8</span>
      </div>
      <div className={styles.ownerCafeAddr}>3-1 Karasuma-dōri · {t('showcase.mock.minWalk', { min: 8 })}</div>
      <div className={styles.ownerCafePinned}>
        <span className={styles.ownerCafePinnedLabel}>{t('showcase.mock.thisWeek')}</span>
        <span>{t('showcase.mock.thisWeekNote')}</span>
      </div>
      <span className={`${styles.ownerCafeChip} ${styles.ownerCafeChipVerified}`}>
        <span aria-hidden>✓</span>
        {t('showcase.mock.ownedBy')} @bluebottle
      </span>
    </div>
  );
}
