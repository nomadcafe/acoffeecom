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
import { usePathname } from './hooks/usePathname';
import { buildLocalizedPathname, stripLocalePrefix } from './i18n/detectLocale';
import { isUpdatesPath } from './i18n/changelog';
import './App.css';

const Map = lazy(() => import('./components/Map').then((m) => ({ default: m.Map })));
const UpdateLogPage = lazy(() =>
  import('./components/UpdateLogPage').then((m) => ({ default: m.UpdateLogPage })),
);

function AppShell() {
  const { t, locale } = useI18n();
  const homeHref = buildLocalizedPathname('/', locale);

  return (
    <div className="app">
      <header className="header">
        <div className="headerInner">
          <div className="headerBrand">
            <a className="logo" href={homeHref}>
              <img src="/logo.png" alt={t('app.logoAlt')} className="logoImage" width={460} height={130} />
            </a>
          </div>
          <div className="headerTitles">
            <h1>{t('app.title')}</h1>
            <p>{t('app.tagline')}</p>
          </div>
          <div className="headerAside headerAsideBar">
            <VisitedPlacesMenu />
            <SavedPlacesMenu />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="main">
        <aside className="sidebar">
          <LocationInput />
          <SearchFilters />
          <CoffeeShopList />
        </aside>

        <section className="map-section">
          <Suspense fallback={<div className="mapFallback" aria-hidden="true" />}>
            <Map />
          </Suspense>
        </section>
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

  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

export default function App() {
  return <AppRoute />;
}
