import type { Request, Response } from 'express';

export const SESSION_COOKIE_NAME = 'gym_session';

function isSecureContext(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function readSessionCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() !== SESSION_COOKIE_NAME) {
      continue;
    }
    try {
      const value = decodeURIComponent(part.slice(separator + 1).trim());
      return value.length > 0 ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function setSessionCookie(
  res: Response,
  token: string,
  expiresAt: Date,
): void {
  // La expiración real la impone la base; maxAge solo adelanta el descarte.
  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: 'lax',
    path: '/',
  });
}
