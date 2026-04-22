import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useI18n } from '../context/I18nContext';
import styles from './BottomSheet.module.css';

type Snap = 'peek' | 'half' | 'full';

const SNAP_ORDER: Snap[] = ['peek', 'half', 'full'];

interface Props {
  children: ReactNode;
}

/**
 * Total sheet height as a fraction of viewport. The sheet is always this tall;
 * the snap states slide it up/down so only a portion is visible.
 */
const SHEET_VH = 0.9;
/** Visible portion of the sheet when peeked (handle + one line of content). */
const PEEK_PX = 136;
/** Fraction of viewport visible at half snap. */
const HALF_FRACTION = 0.52;
/** Drag distance in px that triggers a snap even if the absolute position is closer to the previous snap. */
const VELOCITY_TRIGGER_PX = 60;

function getSnapOffsetPx(snap: Snap, viewportH: number): number {
  const sheetH = SHEET_VH * viewportH;
  if (snap === 'full') return 0;
  if (snap === 'half') return Math.max(0, sheetH - HALF_FRACTION * viewportH);
  return Math.max(0, sheetH - PEEK_PX);
}

export function BottomSheet({ children }: Props) {
  const { t } = useI18n();
  const [snap, setSnap] = useState<Snap>('peek');
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragStart = useRef<{ y: number; offset: number } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStart.current = {
        y: e.clientY,
        offset: getSnapOffsetPx(snap, window.innerHeight),
      };
      setDragOffset(dragStart.current.offset);
    },
    [snap],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const dy = e.clientY - dragStart.current.y;
    const sheetH = SHEET_VH * window.innerHeight;
    const next = Math.max(0, Math.min(sheetH, dragStart.current.offset + dy));
    setDragOffset(next);
  }, []);

  const onPointerEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragStart.current) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const currentOffset = dragOffset ?? dragStart.current.offset;
      const startOffset = dragStart.current.offset;
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
        const diff = Math.abs(getSnapOffsetPx(s, window.innerHeight) - currentOffset);
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
    >
      <div
        className={styles.handle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
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
