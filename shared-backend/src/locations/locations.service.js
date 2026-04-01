import {
  MAP_GEOCODING_BASE_URL,
  MAP_GEOCODING_COUNTRY_CODES,
  MAP_GEOCODING_EMAIL,
  MAP_GEOCODING_PROVIDER,
  MAP_GEOCODING_USER_AGENT,
} from '../config/env.js';
import { supabaseAdmin } from '../database/supabase.js';

const geocodeCache = new Map();
let nominatimChain = Promise.resolve();

async function listProvinces() {
  const { data, error } = await supabaseAdmin.from('provinces').select('code, name').order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function listWardsByProvince(provinceCode) {
  const { data, error } = await supabaseAdmin
    .from('wards')
    .select('code, province_code, name')
    .eq('province_code', provinceCode)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function getProvinceByCode(code) {
  const { data, error } = await supabaseAdmin.from('provinces').select('code, name').eq('code', code).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

async function getWardByCode(code) {
  const { data, error } = await supabaseAdmin
    .from('wards')
    .select('code, province_code, name')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

function buildFormattedAddress({ address, ward, province }) {
  return [address, ward, province].filter((value) => typeof value === 'string' && value.trim().length > 0).join(', ');
}

async function resolveProvinceAndWard({ provinceCode, wardCode, province, ward }) {
  let resolvedProvince = null;
  let resolvedWard = null;

  if (provinceCode) {
    resolvedProvince = await getProvinceByCode(provinceCode);
    if (!resolvedProvince) {
      const error = new Error('Selected province was not found.');
      error.statusCode = 400;
      throw error;
    }
  }

  if (wardCode) {
    resolvedWard = await getWardByCode(wardCode);
    if (!resolvedWard) {
      const error = new Error('Selected ward was not found.');
      error.statusCode = 400;
      throw error;
    }
  }

  if (!resolvedProvince && resolvedWard?.province_code) {
    resolvedProvince = await getProvinceByCode(resolvedWard.province_code);
  }

  if (resolvedProvince && resolvedWard && resolvedWard.province_code !== resolvedProvince.code) {
    const error = new Error('Selected ward does not belong to the selected province.');
    error.statusCode = 400;
    throw error;
  }

  return {
    provinceRecord: resolvedProvince,
    wardRecord: resolvedWard,
    provinceName: resolvedProvince?.name ?? province ?? '',
    wardName: resolvedWard?.name ?? ward ?? '',
    provinceCode: resolvedProvince?.code ?? provinceCode ?? null,
    wardCode: resolvedWard?.code ?? wardCode ?? null,
  };
}

function enqueueNominatimRequest(task) {
  const scheduledTask = nominatimChain.then(task);
  nominatimChain = scheduledTask
    .catch(() => undefined)
    .then(() => new Promise((resolve) => setTimeout(resolve, 1100)));
  return scheduledTask;
}

async function geocodeWithNominatim(query) {
  const cacheKey = query.trim().toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await enqueueNominatimRequest(async () => {
    const endpoint = new URL('search', MAP_GEOCODING_BASE_URL.endsWith('/') ? MAP_GEOCODING_BASE_URL : `${MAP_GEOCODING_BASE_URL}/`);
    endpoint.searchParams.set('q', query);
    endpoint.searchParams.set('format', 'jsonv2');
    endpoint.searchParams.set('limit', '1');
    endpoint.searchParams.set('addressdetails', '1');

    const countryCodes = String(MAP_GEOCODING_COUNTRY_CODES ?? '').trim();
    if (countryCodes) {
      endpoint.searchParams.set('countrycodes', countryCodes);
    }

    const email = String(MAP_GEOCODING_EMAIL ?? '').trim();
    if (email) {
      endpoint.searchParams.set('email', email);
    }

    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent': MAP_GEOCODING_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Geocoding provider request failed with status ${response.status}.`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload) || payload.length === 0) {
      return null;
    }

    return payload[0];
  });

  if (result) {
    geocodeCache.set(cacheKey, result);
  }

  return result;
}

async function geocodeAddress({ address, provinceCode, wardCode, province, ward }) {
  const resolvedArea = await resolveProvinceAndWard({ provinceCode, wardCode, province, ward });
  const formattedAddress = buildFormattedAddress({
    address,
    ward: resolvedArea.wardName,
    province: resolvedArea.provinceName,
  });

  if (!formattedAddress) {
    const error = new Error('A valid formatted address is required for geocoding.');
    error.statusCode = 400;
    throw error;
  }

  if (MAP_GEOCODING_PROVIDER !== 'nominatim') {
    const error = new Error(`Unsupported geocoding provider: ${MAP_GEOCODING_PROVIDER}`);
    error.statusCode = 500;
    throw error;
  }

  const result = await geocodeWithNominatim(formattedAddress);
  if (!result) {
    const error = new Error('No geocoding result was found for the selected address.');
    error.statusCode = 404;
    throw error;
  }

  const lat = Number(result.lat);
  const lng = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const error = new Error('Geocoding provider returned invalid coordinates.');
    error.statusCode = 502;
    throw error;
  }

  return {
    address,
    ward: resolvedArea.wardName,
    province: resolvedArea.provinceName,
    city: resolvedArea.provinceName,
    provinceCode: resolvedArea.provinceCode,
    wardCode: resolvedArea.wardCode,
    formattedAddress,
    mapProvider: 'nominatim',
    geocodedAt: new Date().toISOString(),
    geocodeConfidence: Number.isFinite(Number(result.importance)) ? Number(Number(result.importance).toFixed(4)) : null,
    lat: Number(lat.toFixed(7)),
    lng: Number(lng.toFixed(7)),
    providerDisplayName: typeof result.display_name === 'string' ? result.display_name : formattedAddress,
  };
}

export {
  buildFormattedAddress,
  geocodeAddress,
  getProvinceByCode,
  getWardByCode,
  listProvinces,
  listWardsByProvince,
  resolveProvinceAndWard,
};
