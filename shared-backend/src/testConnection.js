import { supabase } from './config/supabase.client.js'

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