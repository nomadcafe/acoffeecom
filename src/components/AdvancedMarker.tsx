import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGoogleMap } from '@react-google-maps/api';

interface AdvancedMarkerProps {
  position: google.maps.LatLngLiteral;
  title?: string;
  zIndex?: number;
  onClick?: () => void;
  /**
   * Where on the rendered content the lat/lng anchors.
   * - 'bottom' (default, matches raw AdvancedMarkerElement): bottom-center of
   *   content sits on position. Right for teardrop pins whose "point" should
   *   touch the ground.
   * - 'center': center of content sits on position. Right for round dots.
   */
  anchor?: 'bottom' | 'center';
  /** React nodes rendered as the marker's DOM content. */
  children: ReactNode;
}

/**
 * Replacement for the deprecated google.maps.Marker. Creates an
 * AdvancedMarkerElement imperatively (since @react-google-maps/api has no
 * first-class component for it) and portals React children into its content
 * div, so call sites can use normal JSX for the visual.
 *
 * Requires a Map ID on the parent GoogleMap — AdvancedMarkerElement is
 * invisible without one.
 */
export function AdvancedMarker({
  position,
  title,
  zIndex,
  onClick,
  anchor = 'bottom',
  children,
}: AdvancedMarkerProps) {
  const map = useGoogleMap();
  // One container div per marker instance — AdvancedMarkerElement does not
  // clone its content and reuses the same node, so we cannot share.
  const container = useMemo(() => document.createElement('div'), []);
  useEffect(() => {
    // anchor='center' shifts the content down by 50% of its height so the
    // visual center lands on the lat/lng. anchor='bottom' keeps the default.
    container.style.transform = anchor === 'center' ? 'translateY(50%)' : '';
  }, [anchor, container]);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  const clickable = onClick != null;

  useEffect(() => {
    if (!map || !window.google?.maps?.marker?.AdvancedMarkerElement) return;

    const marker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position,
      content: container,
      title: title ?? '',
      zIndex: zIndex ?? null,
      // `gmpClickable` makes the marker focusable + fire gmp-click. Only enable
      // when the caller actually handles clicks so non-interactive markers
      // stay out of the keyboard tab order.
      gmpClickable: clickable,
    });
    markerRef.current = marker;

    // AdvancedMarkerElement uses 'gmp-click', not 'click'. Using 'click'
    // produces a deprecation warning from the Maps runtime.
    const clickListener = clickable
      ? marker.addListener('gmp-click', () => onClickRef.current?.())
      : null;

    return () => {
      clickListener?.remove();
      marker.map = null;
      markerRef.current = null;
    };
    // Only (re)create the marker when the map reference or clickability
    // changes. Position, title, zIndex are updated via the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, container, clickable]);

  useEffect(() => {
    if (markerRef.current) markerRef.current.position = position;
    // Depend on lat/lng primitives, not the `position` object — parents often
    // pass a fresh object literal on every render, which would thrash this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position.lat, position.lng]);

  useEffect(() => {
    if (markerRef.current) markerRef.current.title = title ?? '';
  }, [title]);

  useEffect(() => {
    if (markerRef.current) markerRef.current.zIndex = zIndex ?? null;
  }, [zIndex]);

  return createPortal(children, container);
}
