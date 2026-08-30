import { createClient } from '@/lib/supabase/server';
import { ok } from '@/lib/http';
import { APP_SESSION_COOKIE } from '@/lib/app-session';

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const response = ok(true);
  response.cookies.set(APP_SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
