import { supabase } from '@/src/data/clients';

export interface SkillOption {
  id: string;
  skillName: string;
}

export interface ProvinceOption {
  code: string;
  name: string;
}

export interface WardOption {
  code: string;
  name: string;
}

interface SkillRow {
  id: string;
  skill_name: string;
}

interface ProvinceRow {
  code: string;
  name: string;
}

interface WardRow {
  code: string;
  name: string;
}

export async function fetchSkillOptions(): Promise<SkillOption[]> {
  const { data, error } = await supabase
    .from('core_skills')
    .select('id, skill_name')
    .order('skill_name', { ascending: true })
    .returns<SkillRow[]>();

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({ id: r.id, skillName: r.skill_name }));
}

export async function fetchProvinceOptions(): Promise<ProvinceOption[]> {
  const { data, error } = await supabase
    .from('provinces')
    .select('code, name')
    .order('name', { ascending: true })
    .returns<ProvinceRow[]>();

  if (error) throw new Error(error.message);

  return data ?? [];
}

export async function fetchWardOptions(provinceCode: string): Promise<WardOption[]> {
  const { data, error } = await supabase
    .from('wards')
    .select('code, name')
    .eq('province_code', provinceCode)
    .order('name', { ascending: true })
    .returns<WardRow[]>();

  if (error) throw new Error(error.message);

  return data ?? [];
}
