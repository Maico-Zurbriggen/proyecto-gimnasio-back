import type { PrismaClient } from '@prisma/client';

import type { TimezoneCatalog } from '../../application/ports/timezone-catalog';

/**
 * Zonas IANA geográficas que reconoce PostgreSQL. Se excluyen `Etc/`, `posix/`
 * y los alias heredados (`US/Eastern`, `Brazil/East`): no son zonas que un
 * gimnasio deba elegir.
 */
const ZONAS_GEOGRAFICAS =
  '^(Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific)/';

/**
 * Catálogo leído de `pg_timezone_names`. Se cachea por proceso: el catálogo de
 * zonas sólo cambia al actualizar el servidor de base de datos.
 */
export class PrismaTimezoneCatalog implements TimezoneCatalog {
  private cache: Promise<string[]> | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  list(): Promise<string[]> {
    this.cache ??= this.prisma.$queryRaw<Array<{ name: string }>>`
        SELECT name FROM pg_timezone_names
        WHERE name ~ ${ZONAS_GEOGRAFICAS}
        ORDER BY name`
      .then((rows) => rows.map((row) => row.name))
      .catch((error: unknown) => {
        this.cache = null;
        throw error;
      });
    return this.cache;
  }

  async exists(timezone: string): Promise<boolean> {
    return (await this.list()).includes(timezone);
  }
}
