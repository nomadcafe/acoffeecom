# A Coffee Meetup Finder

A React web app that finds coffee shops at the midpoint between two locations, with a favorites/starring feature.

## Features

- Enter two addresses and find the geographic midpoint
- Displays coffee shops near the midpoint with 4+ star ratings
- Interactive Google Map with markers for both locations, midpoint, and coffee shops
- Star/favorite shops to save them across sessions (localStorage)
- Starred shops appear first in search results
- Mobile-responsive design

## Setup

### 1. Get a Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable these APIs:
   - Maps JavaScript API
   - Geocoding API
   - Places API
4. Go to **Credentials** → **Create Credentials** → **API Key**
5. (Recommended) Restrict the key:
   - Application restrictions: HTTP referrers
   - Add: `localhost:*` for development

### 2. Configure the Project

```bash
# Clone and enter the directory
cd coffee-meetup

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

Edit `.env` and add your API key:

```
VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
```

### 3. Run the App

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Usage

1. Enter your location in the first input (e.g., "Times Square, NYC")
2. Enter your friend's location in the second input (e.g., "Brooklyn Bridge, NYC")
3. Click "Find Meetup Spot"
4. View coffee shops on the map and in the list
5. Click the star button to save favorites

## Tech Stack

- **Vite** + **React** (TypeScript)
- **@react-google-maps/api** for Google Maps integration
- **CSS Modules** for styling
- **localStorage** for persisting starred shops

## Project Structure

```
src/
├── components/
│   ├── LocationInput.tsx      # Address input form
│   ├── Map.tsx                # Google Maps display
│   ├── CoffeeShopList.tsx     # Results list
│   ├── CoffeeShopCard.tsx     # Individual shop card
│   └── StarButton.tsx         # Favorite toggle
├── hooks/
│   └── useStarredShops.ts     # localStorage persistence
├── utils/
│   ├── geocoding.ts           # Address → coordinates
│   ├── places.ts              # Coffee shop search
│   └── midpoint.ts            # Geographic center calculation
├── context/
│   └── AppContext.tsx         # Global state
├── types/
│   └── index.ts               # TypeScript interfaces
├── App.tsx
└── App.css
```
