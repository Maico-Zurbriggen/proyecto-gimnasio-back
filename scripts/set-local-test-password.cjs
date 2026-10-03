require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
const isLocalDatabase =
  ['localhost', '127.0.0.1'].includes(databaseUrl.hostname) &&
  databaseUrl.port.length > 0 &&
  databaseUrl.port === (process.env.LOCAL_DATABASE_PORT ?? '55432') &&
  databaseUrl.pathname === '/gym_local';

if (!isLocalDatabase) {
  throw new Error('This command only supports the local gym_local database');
}

const password = process.env.LOCAL_TEST_PASSWORD;
if (!password) {
  throw new Error('Set LOCAL_TEST_PASSWORD before running this command');
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(
      password,
      Number(process.env.PASSWORD_HASH_COST ?? 12),
    );
    const result = await prisma.user.updateMany({
      where: { emailNormalized: 'alumno.martin@gimnasio.test' },
      data: { passwordHash },
    });
    if (result.count !== 1) {
      throw new Error(
        `Expected one local seed account; updated ${result.count}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
