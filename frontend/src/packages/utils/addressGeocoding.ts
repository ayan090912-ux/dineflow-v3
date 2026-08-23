export interface StructuredAddress {
  fullAddress: string;
  locality: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
}

const GEOCODING_API_KEY = import.meta.env.VITE_GEOCODING_API_KEY || '';
const GEOCODING_SERVICE_URL = import.meta.env.VITE_GEOCODING_SERVICE_URL || '';

/**
 * Searches for addresses matching a text query using Nominatim/Photon geocoding APIs.
 */
export async function searchAddresses(query: string): Promise<StructuredAddress[]> {
  if (!query || query.trim().length < 2) return [];

  const cleanQuery = query.trim();

  try {
    // If a custom geocoding service URL is configured
    if (GEOCODING_SERVICE_URL) {
      const url = `${GEOCODING_SERVICE_URL}?q=${encodeURIComponent(cleanQuery)}${GEOCODING_API_KEY ? `&key=${GEOCODING_API_KEY}` : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return data.map((item) => parseNominatimResult(item));
        }
      }
    }

    // Default 1: OpenStreetMap Nominatim Geocoding API
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(cleanQuery)}&limit=6`;
    const res = await fetch(nominatimUrl, {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'DinelyCloudOS/3.0',
      },
    });

    if (res.ok) {
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0) {
        return results.map((item) => parseNominatimResult(item));
      }
    }

    // Fallback 2: Komoot Photon API
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}&limit=6`;
    const photonRes = await fetch(photonUrl);
    if (photonRes.ok) {
      const photonData = await photonRes.json();
      if (photonData?.features && Array.isArray(photonData.features)) {
        return photonData.features.map((feat: any) => parsePhotonFeature(feat));
      }
    }
  } catch (err) {
    console.warn('Address geocoding search error:', err);
  }

  return [];
}

/**
 * Reverse geocodes coordinates (latitude, longitude) to a structured address object.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<StructuredAddress | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'DinelyCloudOS/3.0',
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.address) {
        return parseNominatimResult(data);
      }
    }
  } catch (err) {
    console.warn('Reverse geocoding error:', err);
  }

  // Fallback structure if network fails but GPS coordinates exist
  return {
    fullAddress: `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`,
    locality: 'Current Location',
    city: '',
    state: '',
    country: 'India',
    postalCode: '',
    latitude: lat,
    longitude: lng,
    placeId: `gps-${lat.toFixed(4)}-${lng.toFixed(4)}`,
  };
}

/**
 * Helper to parse OpenStreetMap Nominatim response item.
 */
function parseNominatimResult(item: any): StructuredAddress {
  const addr = item.address || {};
  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.county ||
    addr.state_district ||
    '';

  const locality =
    addr.suburb ||
    addr.neighbourhood ||
    addr.residential ||
    addr.commercial ||
    addr.road ||
    addr.quarter ||
    addr.subdistrict ||
    '';

  const state = addr.state || addr.region || '';
  const country = addr.country || 'India';
  const postalCode = addr.postcode || '';
  const lat = item.lat ? parseFloat(item.lat) : null;
  const lon = item.lon ? parseFloat(item.lon) : null;

  return {
    fullAddress: item.display_name || buildAddressString(locality, city, state, country, postalCode),
    locality: locality || city,
    city: city || locality,
    state,
    country,
    postalCode,
    latitude: lat,
    longitude: lon,
    placeId: item.place_id ? String(item.place_id) : `osm-${Date.now()}`,
  };
}

/**
 * Helper to parse Komoot Photon feature.
 */
function parsePhotonFeature(feat: any): StructuredAddress {
  const props = feat.properties || {};
  const coords = feat.geometry?.coordinates || [];
  const lon = coords[0] ? parseFloat(coords[0]) : null;
  const lat = coords[1] ? parseFloat(coords[1]) : null;

  const city = props.city || props.town || props.district || props.county || '';
  const locality = props.street || props.name || props.suburb || '';
  const state = props.state || '';
  const country = props.country || 'India';
  const postalCode = props.postcode || '';

  const fullAddress = [
    props.name,
    props.street,
    props.postcode,
    city,
    state,
    country,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    fullAddress: fullAddress || `${city}, ${state}`,
    locality: locality || city,
    city: city || locality,
    state,
    country,
    postalCode,
    latitude: lat,
    longitude: lon,
    placeId: props.osm_id ? String(props.osm_id) : `photon-${Date.now()}`,
  };
}

function buildAddressString(locality: string, city: string, state: string, country: string, postalCode: string): string {
  return [locality, city, state, postalCode, country].filter(Boolean).join(', ');
}
