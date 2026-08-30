import { createClient } from '@supabase/supabase-js';

let adminClient: any = null;

/**
 * Supabase client đặc quyền, chỉ dùng trong API routes chạy phía máy chủ.
 * Tuyệt đối không import mô-đun này vào Client Components.
 */
export function db(): any {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.');
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return adminClient;
}
