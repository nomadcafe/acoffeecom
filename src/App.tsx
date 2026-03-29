import { AppProvider } from './context/AppContext';
import { LocationInput } from './components/LocationInput';
import { SearchFilters } from './components/SearchFilters';
import { Map } from './components/Map';
import { CoffeeShopList } from './components/CoffeeShopList';
import './App.css';

function App() {
  return (
    <AppProvider>
      <div className="app">
        <header className="header">
          <div className="headerInner">
            <div className="headerBrand">
              <a className="logo" href="/">
                <img src="/logo.png" alt="A Coffee" className="logoImage" width={460} height={130} />
              </a>
            </div>
            <div className="headerTitles">
              <h1>A Coffee Meetup Finder</h1>
              <p>Find the perfect coffee spot between you and a friend</p>
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
            <Map />
          </section>
        </main>
      </div>
    </AppProvider>
  );
}

export default App;
