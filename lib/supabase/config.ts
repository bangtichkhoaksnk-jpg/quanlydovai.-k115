export function getPublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !key) {
    throw new Error('Thiếu cấu hình Supabase công khai cho bệnh viện này.');
  }

  return {
    url: url.replace(/\/rest\/v1\/?$/, ''),
    key,
  };
}
