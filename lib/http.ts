import { NextResponse } from 'next/server';

export function ok(data: unknown) { return NextResponse.json({ ok: true, data }); }

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const parts = [value.message, value.details, value.hint]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    if (parts.length) return [...new Set(parts)].join(' — ');
    if (typeof value.code === 'string' && value.code) return `Lỗi Supabase (${value.code}).`;
  }

  return 'Không thể xử lý yêu cầu. Vui lòng thử lại.';
}

export function fail(error: unknown, status = 400) {
  const message = errorMessage(error);
  if (message === 'UNAUTHORIZED') return NextResponse.json({ ok: false, error: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
  if (message === 'FORBIDDEN') return NextResponse.json({ ok: false, error: 'Chỉ người quản lý được sử dụng chức năng này.' }, { status: 403 });
  return NextResponse.json({ ok: false, error: message }, { status });
}
