import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import styles from './BottomSheet.module.css';

type Snap = 'peek' | 'half' | 'full';

const SNAP_ORDER: Snap[] = ['peek', 'half', 'full'];

/** Visible portion of the sheet when peeked (handle + one line of content). */
const PEEK_PX = 136;
/** Fraction of viewport visible at half snap. */
const HALF_FRACTION = 0.52;
/** Drag distance in px that triggers a snap even if the absolute position is closer to the previous snap. */
const VELOCITY_TRIGGER_PX = 60;
/** Movement under this is treated as a tap, not a drag. */
const DRAG_THRESHOLD_PX = 6;

interface Props {
  children: ReactNode;
}

/**
 * @param snap target snap point
 * @param sheetH measured sheet height in px (matches `height: 90dvh` in CSS)
 * @param viewportH current visible viewport height in px
 */
function getSnapOffsetPx(snap: Snap, sheetH: number, viewportH: number): number {
  if (snap === 'full') return 0;
  if (snap === 'half') return Math.max(0, sheetH - HALF_FRACTION * viewportH);
  return Math.max(0, sheetH - PEEK_PX);
}

export function BottomSheet({ children }: Props) {
  const { t } = useI18n();
  const [snap, setSnap] = useState<Snap>('peek');
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragStart = useRef<{
    y: number;
    offset: number;
    pointerId: number;
    captured: boolean;
    onHandle: boolean;
  } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!sheetRef.current) return;
      const target = e.target as Node;
      const onHandle = handleRef.current?.contains(target) ?? false;
      // At full snap, pointer on content should scroll natively; only drag-on-handle collapses.
      if (snap === 'full' && !onHandle) return;

      dragStart.current = {
        y: e.clientY,
        offset: getSnapOffsetPx(snap, sheetRef.current.offsetHeight, window.innerHeight),
        pointerId: e.pointerId,
        captured: false,
        onHandle,
      };
    },
    [snap],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart.current || !sheetRef.current) return;
    const dy = e.clientY - dragStart.current.y;

    // Defer pointer capture until movement exceeds the tap threshold so button
    // clicks inside the sheet keep working.
    if (!dragStart.current.captured) {
      if (Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      e.currentTarget.setPointerCapture(dragStart.current.pointerId);
      dragStart.current.captured = true;
    }

    const sheetH = sheetRef.current.offsetHeight;
    const next = Math.max(0, Math.min(sheetH, dragStart.current.offset + dy));
    setDragOffset(next);
  }, []);

  const onPointerEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const start = dragStart.current;
      if (!start || !sheetRef.current) {
        setDragOffset(null);
        return;
      }
      if (e.currentTarget.hasPointerCapture(start.pointerId)) {
        e.currentTarget.releasePointerCapture(start.pointerId);
      }

      if (!start.captured) {
        // No drag happened. Tapping the handle cycles snap (peek → half → full → peek).
        if (start.onHandle) {
          const idx = SNAP_ORDER.indexOf(snap);
          setSnap(idx === SNAP_ORDER.length - 1 ? 'peek' : SNAP_ORDER[idx + 1]);
        }
        dragStart.current = null;
        setDragOffset(null);
        return;
      }

      const sheetH = sheetRef.current.offsetHeight;
      const currentOffset = dragOffset ?? start.offset;
      const startOffset = start.offset;
      const dragged = currentOffset - startOffset;
      dragStart.current = null;
      setDragOffset(null);

      const startSnapIdx = SNAP_ORDER.indexOf(snap);

      // Velocity-style bias: if the user dragged clearly up/down, shift snap one step.
      if (dragged <= -VELOCITY_TRIGGER_PX && startSnapIdx < SNAP_ORDER.length - 1) {
        setSnap(SNAP_ORDER[startSnapIdx + 1]);
        return;
      }
      if (dragged >= VELOCITY_TRIGGER_PX && startSnapIdx > 0) {
        setSnap(SNAP_ORDER[startSnapIdx - 1]);
        return;
      }

      // Otherwise, snap to the nearest point by absolute position.
      let nearest: Snap = snap;
      let nearestDiff = Infinity;
      for (const s of SNAP_ORDER) {
        const diff = Math.abs(getSnapOffsetPx(s, sheetH, window.innerHeight) - currentOffset);
        if (diff < nearestDiff) {
          nearestDiff = diff;
          nearest = s;
        }
      }
      setSnap(nearest);
    },
    [dragOffset, snap],
  );

  const onHandleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const idx = SNAP_ORDER.indexOf(snap);
      if (e.key === 'ArrowUp' && idx < SNAP_ORDER.length - 1) {
        e.preventDefault();
        setSnap(SNAP_ORDER[idx + 1]);
      } else if (e.key === 'ArrowDown' && idx > 0) {
        e.preventDefault();
        setSnap(SNAP_ORDER[idx - 1]);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSnap(idx === SNAP_ORDER.length - 1 ? 'peek' : SNAP_ORDER[idx + 1]);
      }
    },
    [snap],
  );

  // Keep content-scroll at top when collapsing so next expansion shows the top.
  useEffect(() => {
    if (snap !== 'full' && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [snap]);

  // When a search completes on mobile, the sheet sitting at peek hides the
  // results entirely; even at half the form occupies the visible area while
  // the actual list is below the fold. Auto-promote peek → half AND scroll
  // the inner content to the results anchor so users see results without
  // hunting. CSS overrides snap classes on desktop and contentRef there has
  // overflow:visible, so the scroll is gated to mobile via viewport width.
  const { isLoading } = useApp();
  const [prevIsLoading, setPrevIsLoading] = useState(isLoading);
  const [searchDoneCount, setSearchDoneCount] = useState(0);
  if (prevIsLoading !== isLoading) {
    setPrevIsLoading(isLoading);
    if (prevIsLoading && !isLoading) {
      if (snap === 'peek') setSnap('half');
      setSearchDoneCount((c) => c + 1);
    }
  }

  useEffect(() => {
    if (searchDoneCount === 0) return;
    if (window.innerWidth >= 768) return;
    // Wait for the snap transition (CSS: 300ms) before scrolling so the
    // contentRef has its final scroll height.
    const id = window.setTimeout(() => {
      const content = contentRef.current;
      if (!content) return;
      const anchor = content.querySelector<HTMLElement>('[data-results-anchor]');
      if (!anchor) return;
      const delta = anchor.getBoundingClientRect().top - content.getBoundingClientRect().top;
      content.scrollBy({ top: delta, behavior: 'smooth' });
    }, 340);
    return () => window.clearTimeout(id);
  }, [searchDoneCount]);

  const transformStyle =
    dragOffset != null
      ? { transform: `translateY(${dragOffset}px)`, transition: 'none' as const }
      : undefined;

  return (
    <div
      ref={sheetRef}
      className={`${styles.sheet} ${styles[`snap_${snap}`]}`}
      style={transformStyle}
      role="region"
      aria-labelledby={labelId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div
        ref={handleRef}
        className={styles.handle}
        onKeyDown={onHandleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={t('sheet.dragHandle')}
        aria-valuetext={t(`sheet.snap.${snap}`)}
      >
        <div className={styles.handleBar} aria-hidden />
        <span id={labelId} className={styles.srOnly}>
          {t('sheet.label')}
        </span>
      </div>
      <div ref={contentRef} className={styles.content}>
        {children}
      </div>
    </div>
  );
}
