import jwt from 'jsonwebtoken';

export interface JwtUserPayload {
  sub: string;
  gymId: string;
  roles: string[];
  email: string;
  displayName: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'proyecto-gimnasio-jwt-secret-key-2026';

export class JwtTokenService {
  static sign(payload: JwtUserPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  }

  static verify(token: string): JwtUserPayload {
    return jwt.verify(token, JWT_SECRET) as JwtUserPayload;
  }
}
