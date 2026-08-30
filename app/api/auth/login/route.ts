import { createClient } from '@/lib/supabase/server';
import { fail, ok } from '@/lib/http';

export async function POST(request: Request) {
  try {
    const { email, username, password } = await request.json();
    const loginEmail = String(email || username || '').trim().toLowerCase();
    if (!loginEmail || !password) throw new Error('Vui lòng nhập email và mật khẩu.');

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: String(password),
    });
    if (error || !data.user) throw new Error('Email hoặc mật khẩu không đúng.');

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
