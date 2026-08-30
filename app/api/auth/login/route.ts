import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/supabase';
import { fail, ok } from '@/lib/http';

export async function POST(request: Request) {
  try {
    const { email, username, password } = await request.json();
    const loginName = String(username || email || '').trim().toLowerCase();
    if (!loginName || !password) throw new Error('Vui lòng nhập tài khoản và mật khẩu.');

    let loginEmail = loginName;
    if (!loginName.includes('@')) {
      const { data: profile } = await db()
        .from('profiles')
        .select('email')
        .eq('username', loginName)
        .eq('active', true)
        .maybeSingle();
      if (!profile?.email) throw new Error('Tài khoản hoặc mật khẩu không đúng.');
      loginEmail = profile.email;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: String(password),
    });
    if (error || !data.user) throw new Error('Tài khoản hoặc mật khẩu không đúng.');

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, role, active')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError || !profile?.active) {
      await supabase.auth.signOut();
      throw new Error('Tài khoản chưa được cấp quyền hoặc đã bị khóa.');
    }

    return ok({ fullName: profile.full_name, role: profile.role });
  } catch (error) { return fail(error); }
}
