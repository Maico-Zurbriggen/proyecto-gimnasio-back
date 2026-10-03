/** La regeneración de prueba sólo puede reemplazar propuestas de la base local. */
export function isLocalGenerationTestingEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  if (
    environment.NODE_ENV !== 'development' ||
    environment.LOCAL_GENERATION_TESTING !== 'true' ||
    !environment.DATABASE_URL
  ) {
    return false;
  }
  try {
    const database = new URL(environment.DATABASE_URL);
    return (
      ['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) &&
      database.port.length > 0 &&
      database.port === (environment.LOCAL_DATABASE_PORT ?? '55432') &&
      database.pathname === '/gym_local'
    );
  } catch {
    return false;
  }
}
