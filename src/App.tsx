import { lazy, Suspense } from 'react';
import { AppProvider } from './context/AppContext';
import { useI18n } from './context/I18nContext';
import { LocationInput } from './components/LocationInput';
import { SearchFilters } from './components/SearchFilters';
import { CoffeeShopList } from './components/CoffeeShopList';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { SavedPlacesMenu } from './components/SavedPlacesMenu';
import { VisitedPlacesMenu } from './components/VisitedPlacesMenu';
import { SiteBottomNav } from './components/SiteBottomNav';
import { BottomSheet } from './components/BottomSheet';
import { usePathname } from './hooks/usePathname';
import { buildLocalizedPathname, stripLocalePrefix } from './i18n/detectLocale';
import { isUpdatesPath } from './i18n/changelog';
import { isPassportPath } from './routes';
import './App.css';

const Map = lazy(() => import('./components/Map').then((m) => ({ default: m.Map })));
const UpdateLogPage = lazy(() =>
  import('./components/UpdateLogPage').then((m) => ({ default: m.UpdateLogPage })),
);
const PassportPage = lazy(() =>
  import('./components/PassportPage').then((m) => ({ default: m.PassportPage })),
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
          </div>
        </div>
      </header>

      <div className="hero">
        <p className="heroTagline">{t('location.title')}</p>
      </div>

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
  const logicalPath = stripLocalePrefix(pathname);

  if (isUpdatesPath(logicalPath)) {
    return (
      <>
        <Suspense fallback={<div className="routeFallback" aria-hidden="true" />}>
          <UpdateLogPage />
        </Suspense>
        <SiteBottomNav />
      </>
    );
  }

  if (isPassportPath(logicalPath)) {
    return (
      <>
        <Suspense fallback={<div className="routeFallback" aria-hidden="true" />}>
          <PassportPage />
        </Suspense>
        <SiteBottomNav />
      </>
    );
  }

  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

export default function App() {
  return <AppRoute />;
}
