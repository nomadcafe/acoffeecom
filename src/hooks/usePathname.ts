import { useCallback, useSyncExternalStore } from 'react';
import { LOCATION_SYNC_EVENT } from '../i18n/locationSync';

function subscribe(onStoreChange: () => void): () => void {
  const handler = () => onStoreChange();
  window.addEventListener('popstate', handler);
  window.addEventListener(LOCATION_SYNC_EVENT, handler);
  return () => {
    window.removeEventListener('popstate', handler);
    window.removeEventListener(LOCATION_SYNC_EVENT, handler);
  };
}

function getSnapshot(): string {
  return window.location.pathname;
}

function getServerSnapshot(): string {
  return '/';
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useNavigate(): (path: string) => void {
  return useCallback((path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new Event(LOCATION_SYNC_EVENT));
  }, []);
}
