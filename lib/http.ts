import { NextResponse } from 'next/server';

export function ok(data: unknown) { return NextResponse.json({ ok: true, data }); }
export function fail(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'UNAUTHORIZED') return NextResponse.json({ ok: false, error: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
  if (message === 'FORBIDDEN') return NextResponse.json({ ok: false, error: 'Chỉ người quản lý được sử dụng chức năng này.' }, { status: 403 });
  return NextResponse.json({ ok: false, error: message }, { status });
}

