import { supabaseAdmin } from '../database/supabase.js';

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

export { getProvinceByCode, getWardByCode, listProvinces, listWardsByProvince };
