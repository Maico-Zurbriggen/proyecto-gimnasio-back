const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Evita consultar columnas `uuid` con identificadores mal formados, por ejemplo
 * un `x-user-id` inválido: Prisma respondería con un error en lugar de "no existe".
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
