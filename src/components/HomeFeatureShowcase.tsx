import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../context/I18nContext';
import { useSession } from '../utils/authClient';
import styles from './HomeFeatureShowcase.module.css';

/**
 * Hero feature showcase — horizontal carousel. Each slide is one
 * feature shown as text + a stylised mock side-by-side. Auto-advances
 * every 5s, pauses on hover/focus, snaps natively on touch swipe.
 *
 * Why a carousel: 6 vertical "story rows" took ~3,000px of scroll —
 * informative but over-budget for a hero. The carousel keeps the
 * "show, don't tell" principle but folds it back into a single hero
 * panel that's roughly 500-600px tall total.
 *
 * Hidden for signed-in users (their return visit is tool-first), and
 * naturally hidden during search since AppHero self-hides then.
 */

interface Feature {
  id: string;
  eyebrowKey: string;
  titleKey: string;
  bodyKey: string;
  mock: () => ReactNode;
}

const MODE_CHIPS = [
  { emoji: '🤝', labelKey: 'agentMode.fair.label' },
  { emoji: '⚡', labelKey: 'agentMode.fast.label' },
  { emoji: '✨', labelKey: 'agentMode.vibe.label' },
  { emoji: '🌙', labelKey: 'agentMode.quiet.label' },
  { emoji: '💸', labelKey: 'agentMode.cheap.label' },
  { emoji: '🕐', labelKey: 'agentMode.now.label' },
];

const AUTO_ADVANCE_MS = 5_000;

export function HomeFeatureShowcase() {
  const { t } = useI18n();
  const { data: session, isPending } = useSession();

  /* Features array kept inside the component so the mock factories
   * close over `useI18n()`'s `t` for child labels (passport mock title,
   * etc.). */
  const FEATURES: Feature[] = [
    { id: 'agent', eyebrowKey: 'showcase.featuredEyebrow', titleKey: 'showcase.row1Title', bodyKey: 'showcase.row1Body', mock: () => <MockAgent /> },
    { id: 'passport', eyebrowKey: 'showcase.passportEyebrow', titleKey: 'showcase.row2Title', bodyKey: 'showcase.row2Body', mock: () => <MockPassport /> },
    { id: 'profile', eyebrowKey: 'showcase.profileEyebrow', titleKey: 'showcase.row3Title', bodyKey: 'showcase.row3Body', mock: () => <MockProfile /> },
    { id: 'booking', eyebrowKey: 'showcase.bookingEyebrow', titleKey: 'showcase.row4Title', bodyKey: 'showcase.row4Body', mock: () => <MockBooking /> },
    { id: 'proposal', eyebrowKey: 'showcase.proposalEyebrow', titleKey: 'showcase.row5Title', bodyKey: 'showcase.row5Body', mock: () => <MockProposal /> },
    { id: 'owner', eyebrowKey: 'showcase.featuredCafeEyebrow', titleKey: 'showcase.row6Title', bodyKey: 'showcase.row6Body', mock: () => <MockOwnerCafe /> },
  ];

  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollSyncRef = useRef<number | null>(null);

  /* Auto-advance. Restarting on every activeIdx change gives consistent
   * timing whether the user manually advanced or the timer did. */
  useEffect(() => {
    if (paused) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const id = window.setTimeout(() => {
      setActiveIdx((i) => (i + 1) % FEATURES.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(id);
  }, [activeIdx, paused, FEATURES.length]);

  /* Programmatic scroll when activeIdx changes (from auto-advance OR
   * dot click). Native smooth scroll handles the animation. */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const slide = track.children[activeIdx] as HTMLElement | undefined;
    if (slide) {
      track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
    }
  }, [activeIdx]);

  /* Sync activeIdx from manual scroll (touch swipe / wheel). Debounced
   * via rAF so we don't fight setState batching while the smooth-scroll
   * animation is mid-flight. */
  const onScroll = useCallback(() => {
    if (scrollSyncRef.current != null) cancelAnimationFrame(scrollSyncRef.current);
    scrollSyncRef.current = requestAnimationFrame(() => {
      const track = trackRef.current;
      if (!track) return;
      const slideWidth = track.clientWidth;
      if (slideWidth === 0) return;
      const idx = Math.round(track.scrollLeft / slideWidth);
      setActiveIdx((cur) => (idx !== cur && idx >= 0 && idx < FEATURES.length ? idx : cur));
    });
  }, [FEATURES.length]);

  if (isPending) return null;
  if (session?.user) return null;

  return (
    <section className={styles.wrap} aria-labelledby="showcase-title">
      <span className={styles.eyebrow}>{t('showcase.eyebrow')}</span>
      <h1 id="showcase-title" className={styles.title}>
        {t('showcase.title')}
      </h1>
      <p className={styles.lead}>{t('showcase.lead')}</p>

      <div
        className={styles.carousel}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <div
          ref={trackRef}
          className={styles.track}
          onScroll={onScroll}
          role="region"
          aria-label={t('showcase.carouselAria')}
          aria-roledescription="carousel"
        >
          {FEATURES.map((f, i) => (
            <article
              key={f.id}
              className={styles.slide}
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${FEATURES.length}`}
              aria-hidden={i !== activeIdx ? true : undefined}
            >
              <div className={styles.slideText}>
                <span className={styles.slideEyebrow}>{t(f.eyebrowKey)}</span>
                <h2 className={styles.slideTitle}>{t(f.titleKey)}</h2>
                <p className={styles.slideBody}>{t(f.bodyKey)}</p>
              </div>
              <div className={styles.slideVisual}>{f.mock()}</div>
            </article>
          ))}
        </div>
      </div>

      <div className={styles.dots} role="tablist" aria-label={t('showcase.dotsAria')}>
        {FEATURES.map((f, i) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            className={`${styles.dot} ${i === activeIdx ? styles.dotActive : ''}`}
            aria-selected={i === activeIdx}
            aria-label={t(f.titleKey)}
            onClick={() => setActiveIdx(i)}
          />
        ))}
      </div>

      <div className={styles.modeStrip} aria-label={t('agentMode.aria')}>
        {MODE_CHIPS.map((m) => (
          <span key={m.labelKey} className={styles.modeChip}>
            <span aria-hidden>{m.emoji}</span>
            <span>{t(m.labelKey)}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

/* ────────── Mocks (unchanged from row-layout version) ────────── */

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
  return (
    <div className={styles.mockProfile}>
      <div className={styles.profileAvatar}>H</div>
      <div className={styles.profileName}>Hello</div>
      <div className={styles.profileHandle}>@hello · acoffee.com/hello</div>
      <div className={styles.profileBio}>Coffee, midpoints, and the occasional croissant.</div>
      <div className={styles.profileFeatured}>
        <span aria-hidden>📍</span>
        <span><strong>Blue Bottle</strong> · Shibuya, Tokyo</span>
      </div>
      <div className={styles.profileLinks}>
        <span>🔗 Site</span>
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
  return (
    <div className={styles.mockProposal}>
      <span className={styles.proposalEyebrow}>📨 Proposal from Alex</span>
      <div className={styles.proposalHeadline}>
        ☕ <strong>Coffee at Blue Bottle</strong>
      </div>
      <div className={styles.proposalMeta}>Tomorrow · 3:00 PM · Shibuya</div>
      <div className={styles.proposalActions}>
        <button type="button" disabled className={`${styles.proposalBtn} ${styles.proposalBtnPrimary}`}>OK</button>
        <button type="button" disabled className={styles.proposalBtn}>Different café</button>
        <button type="button" disabled className={styles.proposalBtn}>Later</button>
      </div>
    </div>
  );
}

function MockOwnerCafe() {
  return (
    <div className={styles.mockOwnerCafe}>
      <div className={styles.ownerCafeHeader}>
        <strong>Blue Bottle Coffee</strong>
        <span className={styles.ownerCafeRating}>★ 4.8</span>
      </div>
      <div className={styles.ownerCafeAddr}>1-2-1 Shibuya · 8 min walk</div>
      <a className={styles.ownerCafeChip}>↗ shared by @hello</a>
    </div>
  );
}
