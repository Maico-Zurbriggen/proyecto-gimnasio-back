import { createHash } from 'node:crypto';

export function canonicalHash(value: unknown): string {
  function sort(item: unknown): unknown {
    if (item instanceof Date) return item.toISOString();
    if (Array.isArray(item)) return item.map(sort);
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(
      Object.entries(item)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([key, child]) => [key, sort(child)]),
    );
  }
  return createHash('sha256')
    .update(JSON.stringify(sort(value)))
    .digest('hex');
}
