import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY in shared-backend/.env')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function test() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .limit(1)

  if (error) {
    console.error('Supabase error:', error)
  } else {
    console.log('Connected successfully:', data)
  }
}

test()
