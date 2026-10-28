// Geocoding, driving distance and roof estimates through Google APIs (server key).
// Everything falls back gracefully when no server key is configured.
import { config } from '../config.js';

const key = () => config.google.serverKey;

export function haversineMiles(a, b) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function fetchJson(url, init, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

export async function geocode(address) {
  if (!key() || !address) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key()}`;
  try {
    const { body } = await fetchJson(url);
    const r = body.results?.[0];
    if (!r) return null;
    return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, formatted: r.formatted_address, placeId: r.place_id };
  } catch {
    return null;
  }
}

// Driving distance in miles from the business. Uses the Routes API when a server key
// is configured, otherwise straight-line distance x 1.25 as a road-distance estimate.
export async function drivingMiles(from, to) {
  if (from?.lat == null || to?.lat == null) return 0;
  if (key()) {
    try {
      const { ok, body } = await fetchJson('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': 'routes.distanceMeters' },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
          destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
          travelMode: 'DRIVE',
        }),
      });
      const meters = ok && body.routes?.[0]?.distanceMeters;
      if (meters) return meters / 1609.344;
    } catch {
      /* fall through to estimate */
    }
  }
  return haversineMiles(from, to) * 1.25;
}

// Google Solar API: whole-roof surface area (accounts for pitch), converted to sq ft.
export async function solarRoofArea(lat, lng) {
  if (!key()) return { available: false, reason: 'Solar API is not configured' };
  for (const quality of ['HIGH', 'MEDIUM', 'LOW']) {
    const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=${quality}&key=${key()}`;
    try {
      const { ok, body } = await fetchJson(url);
      if (!ok) continue;
      const stats = body.solarPotential?.wholeRoofStats;
      if (!stats?.areaMeters2) continue;
      const segments = (body.solarPotential.roofSegmentStats || []).map((s) => ({
        pitchDegrees: s.pitchDegrees,
        azimuthDegrees: s.azimuthDegrees,
        areaSqft: Math.round(s.stats.areaMeters2 * 10.7639),
      }));
      return {
        available: true,
        quality: body.imageryQuality || quality,
        roofAreaSqft: Math.round(stats.areaMeters2 * 10.7639),
        groundAreaSqft: Math.round((stats.groundAreaMeters2 || 0) * 10.7639),
        segments,
      };
    } catch {
      /* try lower quality */
    }
  }
  return { available: false, reason: 'No roof data for this location' };
}
