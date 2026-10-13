import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export function hasValidCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.get('authorization');
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
