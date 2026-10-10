import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const key = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be configured with at least 32 characters.');
  return new TextEncoder().encode(secret);
};
export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(key());
  (await cookies()).set('pos_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 604800 });
}
export async function currentUserId(): Promise<string | null> {
  try { const token = (await cookies()).get('pos_session')?.value; if (!token) return null; return (await jwtVerify(token, key())).payload.sub ?? null; } catch { return null; }
}
export async function requireUser() { const id = await currentUserId(); if (!id) throw new Error('UNAUTHENTICATED'); return id; }
