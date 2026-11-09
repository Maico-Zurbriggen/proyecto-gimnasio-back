import { z } from 'zod';

const cursorSchema = z
  .object({
    occurredOn: z.iso.date(),
    startedAt: z.iso.datetime(),
    id: z.uuid(),
  })
  .strict();

export function decodeSessionCursor(value: string) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
    return cursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
  } catch {
    return null;
  }
}

export function encodeSessionCursor(row: {
  occurredOn: Date;
  startedAt: Date | string;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      occurredOn: row.occurredOn.toISOString().slice(0, 10),
      startedAt:
        typeof row.startedAt === 'string'
          ? row.startedAt
          : row.startedAt.toISOString(),
      id: row.id,
    }),
  ).toString('base64url');
}
