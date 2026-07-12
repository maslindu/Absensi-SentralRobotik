import { createClient } from '@/lib/supabase/server';
import type { AcademicTerm, Profile, RoleName } from '@/lib/types';

export interface SessionInfo {
  userId: string;
  email: string | null;
  profile: Profile;
  role: RoleName;
}

// Ambil user + profile + role di server. null bila tidak login /
// profil belum dibuat.
export async function getSessionInfo(): Promise<SessionInfo | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, roles:role_id(id, name)')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.is_active) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: profile as Profile,
    role: (profile.roles?.name ?? 'guru') as RoleName,
  };
}

export async function getActiveTerm(): Promise<AcademicTerm | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('academic_terms')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AcademicTerm) ?? null;
}
