import { createClient } from '@/lib/supabase/server';

export type AppRole = 'ADMIN' | 'STAFF';

export type AppSession = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
};

export async function getSession(): Promise<AppSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, active')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.active) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: profile.full_name || user.email,
    role: profile.role as AppRole,
  };
}

export async function requireSession(requiredRole?: AppRole | boolean) {
  const session = await getSession();

  if (!session) throw new Error('UNAUTHORIZED');
  const adminRequired = requiredRole === true || requiredRole === 'ADMIN';
  if (adminRequired && session.role !== 'ADMIN') throw new Error('FORBIDDEN');

  return session;
}
