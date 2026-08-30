import { NextResponse } from 'next/server';

export function ok(data: unknown) { return NextResponse.json({ ok: true, data }); }
export function fail(error: unknown, status = 400) {
  const value = error as { message?: unknown; details?: unknown; hint?: unknown } | null;
  const parts = value && typeof value === 'object'
    ? [value.message, value.details, value.hint]
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    : [];
  const message = error instanceof Error
    ? error.message
    : parts.length
      ? [...new Set(parts)].join(' — ')
      : typeof error === 'string'
        ? error
        : 'Không thể lưu dữ liệu. Vui lòng kiểm tra mặt hàng và thử lại.';
  if (message === 'UNAUTHORIZED') return NextResponse.json({ ok: false, error: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
  if (message === 'FORBIDDEN') return NextResponse.json({ ok: false, error: 'Chỉ người quản lý được sử dụng chức năng này.' }, { status: 403 });
  return NextResponse.json({ ok: false, error: message }, { status });
}

