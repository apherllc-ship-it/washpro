// Loads the Google Maps JavaScript API once. The browser key comes from the server at runtime
// (/api/public/config), so it is never baked into the build.
let promise = null;
let authFailed = false;

export const SQM_TO_SQFT = 10.7639;
export const M_TO_FT = 3.28084;

export function loadGoogleMaps(key) {
  if (!key) return Promise.reject(new Error('Google Maps key not configured'));
  if (authFailed) return Promise.reject(new Error('Google Maps key was rejected'));
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google);
  if (promise) return promise;

  promise = new Promise((resolve, reject) => {
    window.__wpMapsReady = async () => {
      const g = window.google;
      // Make sure the classes used directly (Map, Polygon, Marker, geometry) are loaded.
      await Promise.all(['maps', 'marker', 'geometry'].map((lib) => g.maps.importLibrary(lib)));
      resolve(g);
    };
    window.gm_authFailure = () => {
      authFailed = true;
      window.dispatchEvent(new Event('wp-maps-auth-failed'));
    };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&libraries=places,geometry&callback=__wpMapsReady`;
    s.async = true;
    s.onerror = () => {
      promise = null;
      reject(new Error('Google Maps failed to load'));
    };
    document.head.appendChild(s);
  });
  return promise;
}

// Surface types the customer can outline. Polygons measure area, polylines measure length.
export const SURFACES = [
  { key: 'driveway', label: 'Driveway', kind: 'polygon', color: '#f59e0b' },
  { key: 'patio', label: 'Patio / walkway', kind: 'polygon', color: '#10b981' },
  { key: 'roof', label: 'Roof', kind: 'polygon', color: '#ef4444' },
  { key: 'siding', label: 'House siding', kind: 'polygon', color: '#8b5cf6', hint: 'Outline the house footprint. We multiply the perimeter by the wall height.' },
  { key: 'deck', label: 'Deck', kind: 'polygon', color: '#a16207' },
  { key: 'fence', label: 'Fence', kind: 'polyline', color: '#ec4899', hint: 'Click along the fence line.' },
  { key: 'gutter', label: 'Gutters', kind: 'polyline', color: '#06b6d4', hint: 'Click along the roof edge where gutters run.' },
];
export const surfaceByKey = Object.fromEntries(SURFACES.map((s) => [s.key, s]));

export const ROOF_PITCH = [
  { value: 1, label: 'Flat (0–2/12)' },
  { value: 1.05, label: 'Low (3–4/12)' },
  { value: 1.12, label: 'Medium (5–7/12)' },
  { value: 1.25, label: 'Steep (8–10/12)' },
  { value: 1.42, label: 'Very steep (12/12)' },
];

export const STORY_HEIGHT_FT = 10;

// Measures a path with the Geometry library. Returns sq ft / ft.
export function measurePath(google, path, kind) {
  const sph = google.maps.geometry.spherical;
  const latLngs = path.map((p) => new google.maps.LatLng(p.lat, p.lng));
  if (kind === 'polygon') {
    const closed = [...latLngs, latLngs[0]];
    return { area: sph.computeArea(latLngs) * SQM_TO_SQFT, perimeter: sph.computeLength(closed) * M_TO_FT, length: 0 };
  }
  return { area: 0, perimeter: 0, length: sph.computeLength(latLngs) * M_TO_FT };
}

// Turns a measured shape into the billable quantity for the chosen service.
export function autoQuantity(area, service) {
  const m = area.measure || {};
  if (!service) return Math.round(m.area || m.length || 0);
  if (service.unit === 'FLAT') return 1;
  if (service.unit === 'LINFT') return Math.round(m.length || m.perimeter || 0);
  if (area.kind === 'polyline') return Math.round(m.length || 0);
  if (area.surface === 'siding') return Math.round((m.perimeter || 0) * (area.stories || 1) * STORY_HEIGHT_FT);
  if (area.surface === 'roof') return Math.round((m.area || 0) * (area.pitch || 1));
  return Math.round(m.area || 0);
}
