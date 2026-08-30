import { PrismaClient } from '@prisma/client';

export interface HealthCheck {
  check(): Promise<void>;
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export const databaseHealthCheck: HealthCheck = {
  async check() {
    await prisma.$queryRaw`SELECT 1`;
  },
};
