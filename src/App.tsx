import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { AppProvider } from './context/AppContext';
import { useI18n } from './context/I18nContext';
import { LocationInput } from './components/LocationInput';
import { SearchFilters } from './components/SearchFilters';
import { CoffeeShopList } from './components/CoffeeShopList';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { AccountMenu } from './components/AccountMenu';
import { SyncIndicator } from './components/SyncIndicator';
import { SavedPlacesMenu } from './components/SavedPlacesMenu';
import { VisitedPlacesMenu } from './components/VisitedPlacesMenu';
import { SiteBottomNav } from './components/SiteBottomNav';
import { BottomSheet } from './components/BottomSheet';
import { AppHero } from './components/AppHero';
import { usePathname } from './hooks/usePathname';
import { buildLocalizedPathname, stripLocalePrefix } from './i18n/detectLocale';
import { isUpdatesPath } from './i18n/changelog';
import { isPassportPath } from './routes';
import { useTrackPageViews } from './utils/analytics';
import './App.css';

/**
 * Reload once when a dynamic chunk fails to load — almost always means the
 * tab was opened before the latest deploy and the hashed file is gone. The
 * session flag stops us from looping if the failure is something else.
 */
function reloadOnChunkError<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((err) => {
    const flag = 'ac:reloaded-for-chunk-error';
    if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(flag)) {
      sessionStorage.setItem(flag, '1');
      window.location.reload();
    }
    throw err;
  });
}

const Map = lazy(() =>
  reloadOnChunkError(import('./components/Map').then((m) => ({ default: m.Map }))),
);
const UpdateLogPage = lazy(() =>
  reloadOnChunkError(
    import('./components/UpdateLogPage').then((m) => ({ default: m.UpdateLogPage })),
  ),
);
const PassportPage = lazy(() =>
  reloadOnChunkError(
    import('./components/PassportPage').then((m) => ({ default: m.PassportPage })),
  ),
);

function AppShell() {
  const { t, locale } = useI18n();
  const homeHref = buildLocalizedPathname('/', locale);

  return (
    <div className="app">
      <header className="header">
        <div className="headerInner">
          <a className="logo" href={homeHref} aria-label={t('app.logoAlt')}>
            <span className="logoWordmark">ACoffee</span>
          </a>
          <div className="headerAside headerAsideBar">
            <VisitedPlacesMenu />
            <SavedPlacesMenu />
            <LanguageSwitcher />
            {import.meta.env.VITE_AUTH_ENABLED === 'true' && (
              <>
                <SyncIndicator />
                <AccountMenu />
              </>
            )}
          </div>
        </div>
      </header>

      <AppHero />

      <main className="main">
        <section className="map-section">
          <Suspense fallback={<div className="mapFallback" aria-hidden="true" />}>
            <Map />
          </Suspense>
        </section>

        <BottomSheet>
          <aside className="sidebar">
            <LocationInput />
            <SearchFilters />
            <CoffeeShopList />
          </aside>
        </BottomSheet>
      </main>
      <SiteBottomNav />
    </div>
  );
}

function AppRoute() {
  const pathname = usePathname();
  useTrackPageViews(pathname);
  const logicalPath = stripLocalePrefix(pathname);

  let body: ReactNode;
  if (isUpdatesPath(logicalPath)) {
    body = (
      <>
        <Suspense fallback={<div className="routeFallback" aria-hidden="true" />}>
          <UpdateLogPage />
        </Suspense>
        <SiteBottomNav />
      </>
    );
  } else if (isPassportPath(logicalPath)) {
    body = (
      <>
        <Suspense fallback={<div className="routeFallback" aria-hidden="true" />}>
          <PassportPage />
        </Suspense>
        <SiteBottomNav />
      </>
    );
  } else {
    body = <AppShell />;
  }

  // AppProvider wraps every route so PassportPage / UpdateLogPage can share
  // visitedShops + (when auth flag is on) the cloud-sync layer with AppShell.
  return <AppProvider>{body}</AppProvider>;
}

export default function App() {
  return <AppRoute />;
}
