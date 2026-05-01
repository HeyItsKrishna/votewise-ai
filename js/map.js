/**
 * VoteWise — Google Maps Integration
 * =====================================
 * Polling Booth Locator using Google Maps JavaScript API
 *
 * In production: Replace GOOGLE_MAPS_API_KEY with your real key
 * and connect to your Election Commission's official polling data API.
 *
 * Demo: Renders simulated polling locations around the user's
 * detected or selected region using the Maps JavaScript API.
 */

// ─── CONFIGURATION ──────────────────────────────────────────
const MAPS_CONFIG = {
  // Replace with your Google Maps API key
  API_KEY: "YOUR_GOOGLE_MAPS_API_KEY",

  // Default center (New Delhi — changes based on user country)
  DEFAULT_CENTER: { lat: 28.6139, lng: 77.2090 },

  ZOOM: 13,

  // Map styling — matches VoteWise's navy/gold aesthetic
  STYLES: [
    { elementType: "geometry", stylers: [{ color: "#f5f0e8" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#f5f0e8" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#0d1b2a" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#e8e0d4" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#c9963a22" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#b4c3d3" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#d4e8c9" }] },
    { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#c9963a" }] },
  ],
};

// ─── SIMULATED POLLING LOCATIONS ────────────────────────────
/**
 * Demo polling booth data by country
 * In production: Replace with Election Commission API call
 */
const DEMO_POLLING_LOCATIONS = {
  IN: [
    { name: "Government School, Sector 7", type: "Primary Booth", address: "Sector 7, New Delhi", lat: 28.6250, lng: 77.2185 },
    { name: "Community Center, Lodi Colony", type: "Accessible Booth", address: "Lodi Colony, New Delhi", lat: 28.5922, lng: 77.2195 },
    { name: "Municipal Hall, Connaught Place", type: "Central Booth", address: "Connaught Place, New Delhi", lat: 28.6315, lng: 77.2167 },
    { name: "Public Library, Nehru Nagar", type: "Primary Booth", address: "Nehru Nagar, New Delhi", lat: 28.6033, lng: 77.2410 },
    { name: "Panchayat Office, Hauz Khas", type: "Accessible Booth", address: "Hauz Khas, New Delhi", lat: 28.5494, lng: 77.2001 },
  ],
  US: [
    { name: "City Hall Polling Center", type: "Main Polling Place", address: "Washington D.C., USA", lat: 38.8951, lng: -77.0364 },
    { name: "Lincoln Community Center", type: "Drop Box Available", address: "Capitol Hill, D.C.", lat: 38.8897, lng: -77.0090 },
    { name: "Library of Congress Annex", type: "Accessible Booth", address: "D.C., USA", lat: 38.8886, lng: -77.0047 },
  ],
  GB: [
    { name: "Westminster Town Hall", type: "Polling Station", address: "Westminster, London", lat: 51.4975, lng: -0.1357 },
    { name: "Lambeth Council Hall", type: "Polling Station", address: "Lambeth, London", lat: 51.4957, lng: -0.1191 },
    { name: "Southwark Community Hub", type: "Accessible Station", address: "Southwark, London", lat: 51.5034, lng: -0.0855 },
  ],
  DEFAULT: [
    { name: "Central Polling Booth", type: "Main Booth", address: "City Center", lat: 28.6139, lng: 77.2090 },
    { name: "West District Booth", type: "Primary Booth", address: "West District", lat: 28.6200, lng: 77.1950 },
    { name: "South Zone Polling Center", type: "Accessible Booth", address: "South Zone", lat: 28.6050, lng: 77.2190 },
  ],
};

// ─── COUNTRY COORDINATE CENTERS ──────────────────────────────
const COUNTRY_CENTERS = {
  IN: { lat: 28.6139, lng: 77.2090 },
  US: { lat: 38.8951, lng: -77.0364 },
  GB: { lat: 51.4975, lng: -0.1357 },
  AU: { lat: -33.8688, lng: 151.2093 },
  CA: { lat: 45.4215, lng: -75.6972 },
  DE: { lat: 52.5200, lng: 13.4050 },
  FR: { lat: 48.8566, lng: 2.3522 },
  BR: { lat: -15.8267, lng: -47.9218 },
  ZA: { lat: -25.7461, lng: 28.1881 },
  NG: { lat: 6.5244, lng: 3.3792 },
};

// ─── MAP INSTANCE ────────────────────────────────────────────
let mapInstance = null;
let mapLoaded = false;

/**
 * Get user's country code from state
 */
function getUserCountryCode() {
  const country = window.state?.userContext?.country || '';
  const match = Object.entries({
    India: 'IN', 'United States': 'US', 'United Kingdom': 'GB',
    Australia: 'AU', Canada: 'CA', Germany: 'DE', France: 'FR',
    Brazil: 'BR', 'South Africa': 'ZA', Nigeria: 'NG',
  }).find(([name]) => country.includes(name));
  return match ? match[1] : 'IN';
}

/**
 * Create custom map marker SVG
 */
function createMarkerIcon(type) {
  const isAccessible = type.includes('Accessible');
  const color = isAccessible ? '#3BAA75' : '#C9963A';
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
        <path d="M18 0C8.1 0 0 8.1 0 18c0 12.6 18 26 18 26S36 30.6 36 18C36 8.1 27.9 0 18 0z" fill="${color}"/>
        <circle cx="18" cy="18" r="8" fill="white"/>
        <text x="18" y="23" font-size="12" text-anchor="middle" font-family="Arial">${isAccessible ? '♿' : '🗳'}</text>
      </svg>
    `)}`,
    scaledSize: { width: 36, height: 44 },
    anchor: { x: 18, y: 44 },
  };
}

/**
 * Initialize Google Map
 * Called when Map Modal is opened
 */
window.initMap = function () {
  if (mapLoaded || !window.google) {
    if (!window.google) loadMapsAPI();
    return;
  }
  renderMap();
};

function renderMap() {
  const countryCode = getUserCountryCode();
  const center = COUNTRY_CENTERS[countryCode] || MAPS_CONFIG.DEFAULT_CENTER;
  const locations = DEMO_POLLING_LOCATIONS[countryCode] || DEMO_POLLING_LOCATIONS.DEFAULT;

  const mapContainer = document.getElementById('googleMap');
  if (!mapContainer) return;

  // Initialize map
  mapInstance = new google.maps.Map(mapContainer, {
    center,
    zoom: MAPS_CONFIG.ZOOM,
    styles: MAPS_CONFIG.STYLES,
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });

  // Info window (shared)
  const infoWindow = new google.maps.InfoWindow();

  // Add polling booth markers
  locations.forEach((loc, i) => {
    // Simulate slight offset for realism
    const position = {
      lat: loc.lat + (Math.random() - 0.5) * 0.01,
      lng: loc.lng + (Math.random() - 0.5) * 0.01,
    };

    const marker = new google.maps.Marker({
      position,
      map: mapInstance,
      title: loc.name,
      icon: createMarkerIcon(loc.type),
      animation: google.maps.Animation.DROP,
    });

    // Stagger drop animation
    setTimeout(() => {
      marker.setAnimation(null);
    }, i * 300 + 800);

    // Info window on click
    marker.addListener('click', () => {
      infoWindow.setContent(`
        <div style="font-family:'DM Sans',sans-serif;padding:8px;min-width:200px;">
          <strong style="font-size:14px;color:#0d1b2a;">📍 ${loc.name}</strong>
          <p style="font-size:12px;color:#4a5f74;margin:4px 0;">${loc.type}</p>
          <p style="font-size:12px;color:#8a9bb0;margin:0;">${loc.address}</p>
          <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e8e0d4;">
            <span style="font-size:11px;color:#c9963a;font-weight:600;">⏰ Typically open 7AM – 6PM</span>
          </div>
          <a href="https://maps.google.com?q=${position.lat},${position.lng}" 
             target="_blank" rel="noopener"
             style="display:inline-block;margin-top:8px;padding:6px 12px;background:#0d1b2a;color:#e8b45c;border-radius:6px;font-size:12px;text-decoration:none;font-weight:600;">
            🚗 Get Directions
          </a>
        </div>
      `);
      infoWindow.open(mapInstance, marker);
    });
  });

  // User location button
  if (navigator.geolocation) {
    const locationBtn = document.createElement('button');
    locationBtn.textContent = '📍 My Location';
    locationBtn.style.cssText = `
      position:absolute;bottom:80px;right:10px;z-index:10;
      padding:8px 14px;background:#0d1b2a;color:#e8b45c;
      border:none;border-radius:8px;font-size:13px;font-weight:600;
      cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);
    `;
    locationBtn.onclick = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          mapInstance.setCenter(userPos);
          mapInstance.setZoom(15);

          new google.maps.Marker({
            position: userPos,
            map: mapInstance,
            title: 'Your Location',
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: '#3BAA75',
              fillOpacity: 1,
              strokeColor: 'white',
              strokeWeight: 2.5,
            },
          });
        },
        () => alert('Unable to get your location. Please enable location permissions.')
      );
    };
    mapContainer.style.position = 'relative';
    mapContainer.appendChild(locationBtn);
  }

  mapLoaded = true;
};

/**
 * Load Google Maps API dynamically
 */
function loadMapsAPI() {
  if (document.getElementById('gmapsScript')) return;

  const mapContainer = document.getElementById('googleMap');

  // If no real API key, show a stylized fallback
  if (MAPS_CONFIG.API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY') {
    renderFallbackMap(mapContainer);
    return;
  }

  const script = document.createElement('script');
  script.id = 'gmapsScript';
  script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_CONFIG.API_KEY}&callback=renderMap`;
  script.async = true;
  script.defer = true;
  script.onerror = () => renderFallbackMap(mapContainer);
  document.head.appendChild(script);
}

/**
 * Fallback map — beautiful HTML/CSS visualization when Maps API not configured
 */
function renderFallbackMap(container) {
  if (!container) return;

  const countryCode = getUserCountryCode();
  const locations = DEMO_POLLING_LOCATIONS[countryCode] || DEMO_POLLING_LOCATIONS.DEFAULT;

  container.innerHTML = `
    <div style="
      width:100%;height:100%;
      background:linear-gradient(135deg,#f5f0e8 0%,#e8e0d4 100%);
      display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      padding:20px;font-family:'DM Sans',sans-serif;
      position:relative;overflow:hidden;
    ">
      <!-- Grid lines (map simulation) -->
      <div style="
        position:absolute;inset:0;
        background-image:
          linear-gradient(rgba(201,150,58,0.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(201,150,58,0.08) 1px, transparent 1px);
        background-size:40px 40px;
      "></div>

      <!-- Header -->
      <div style="position:relative;z-index:1;text-align:center;margin-bottom:20px;">
        <div style="font-size:28px;margin-bottom:8px;">🗺️</div>
        <h3 style="color:#0d1b2a;font-size:16px;font-weight:700;margin:0 0 4px;">Polling Booth Locator</h3>
        <p style="color:#8a9bb0;font-size:12px;margin:0;">
          Add your Google Maps API key to enable live maps.<br/>
          Showing ${locations.length} simulated locations below.
        </p>
      </div>

      <!-- Location Cards -->
      <div style="
        display:flex;flex-direction:column;gap:8px;
        width:100%;max-width:480px;position:relative;z-index:1;
      ">
        ${locations.map((loc, i) => `
          <div style="
            display:flex;align-items:center;gap:12px;
            padding:10px 14px;
            background:white;border-radius:10px;
            border:1.5px solid ${loc.type.includes('Accessible') ? '#3BAA75' : '#c9963a'}33;
            box-shadow:0 2px 6px rgba(0,0,0,0.06);
            animation:fadeUp 0.4s ease ${i * 0.1}s both;
          ">
            <div style="
              width:36px;height:36px;border-radius:50%;
              background:${loc.type.includes('Accessible') ? '#3BAA7522' : '#c9963a22'};
              display:flex;align-items:center;justify-content:center;
              font-size:18px;flex-shrink:0;
            ">${loc.type.includes('Accessible') ? '♿' : '🗳'}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:13px;color:#0d1b2a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${loc.name}</div>
              <div style="font-size:11px;color:#8a9bb0;">${loc.type} · ${loc.address}</div>
            </div>
            <div style="
              font-size:10px;font-weight:600;
              color:${loc.type.includes('Accessible') ? '#3BAA75' : '#c9963a'};
              white-space:nowrap;
            ">~${(i + 1) * 0.4 + 0.2} km</div>
          </div>
        `).join('')}
      </div>

      <!-- CTA -->
      <div style="
        margin-top:16px;padding:10px 16px;
        background:#0d1b2a;border-radius:10px;
        font-size:12px;color:#e8b45c;font-weight:600;
        position:relative;z-index:1;text-align:center;
      ">
        🔑 Configure your Google Maps API key in js/map.js to enable live maps
      </div>
    </div>
    <style>
      @keyframes fadeUp {
        from { opacity:0; transform:translateY(8px); }
        to   { opacity:1; transform:translateY(0); }
      }
    </style>
  `;

  mapLoaded = true;
}

// ─── AUTO-INIT ───────────────────────────────────────────────
// Override initMap to handle the API key scenario
window.initMap = function () {
  if (MAPS_CONFIG.API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY') {
    renderFallbackMap(document.getElementById('googleMap'));
  } else {
    loadMapsAPI();
  }
};
