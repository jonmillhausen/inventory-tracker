import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'

// Bypasses RLS — only use in server-side routes that do their own authorization.
// SUPABASE_SERVICE_ROLE_KEY must never be exposed to the client.
export function createServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
