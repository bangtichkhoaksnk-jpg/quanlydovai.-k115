import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { APP_SESSION_COOKIE, verifyAppSession } from '@/lib/app-session';
import { db } from '@/lib/supabase';

export type AppRole = 'ADMIN' | 'STAFF';

export type AppSession = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
};

export async function getSession(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  const signedSession = await verifyAppSession(cookieStore.get(APP_SESSION_COOKIE)?.value);
  if (signedSession) {
    const { data: profile } = await db()
      .from('profiles')
      .select('email, full_name, role, active')
      .eq('id', signedSession.id)
      .maybeSingle();
    if (!profile?.active) return null;
    return {
      id: signedSession.id,
      email: profile.email || signedSession.email,
      fullName: profile.full_name || signedSession.fullName,
      role: profile.role as AppRole,
    };
  }

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
