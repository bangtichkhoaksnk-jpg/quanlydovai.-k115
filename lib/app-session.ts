import { SignJWT, jwtVerify } from 'jose';

export const APP_SESSION_COOKIE = 'qldv_session';

export type SignedAppSession = {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'STAFF';
};

function sessionKey() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error('Thiếu SESSION_SECRET trên Vercel.');
  return new TextEncoder().encode(secret);
}

export async function signAppSession(session: SignedAppSession) {
  return new SignJWT({
    email: session.email,
    fullName: session.fullName,
    role: session.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(sessionKey());
}

export async function verifyAppSession(token?: string | null): Promise<SignedAppSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { algorithms: ['HS256'] });
    if (!payload.sub || !payload.email || !payload.fullName || !['ADMIN', 'STAFF'].includes(String(payload.role))) return null;
    return {
      id: payload.sub,
      email: String(payload.email),
      fullName: String(payload.fullName),
      role: payload.role as 'ADMIN' | 'STAFF',
    };
  } catch {
    return null;
  }
}
