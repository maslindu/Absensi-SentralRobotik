import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Client dengan service_role — HANYA boleh dipakai di server
// (route handler). Jangan pernah diimpor dari komponen client.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
