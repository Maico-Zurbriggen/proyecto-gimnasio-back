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

const seedAccounts = new Map([
  ['admin.test@gimnasio.test', '21000000-0000-4000-8000-000000000001'],
  ['entrenador.lucia@gimnasio.test', '21000000-0000-4000-8000-000000000002'],
  ['entrenador.marco@gimnasio.test', '21000000-0000-4000-8000-000000000003'],
  ['alumno.martin@gimnasio.test', '21000000-0000-4000-8000-000000000004'],
  ['alumna.sofia@gimnasio.test', '21000000-0000-4000-8000-000000000005'],
  ['alumno.diego@gimnasio.test', '21000000-0000-4000-8000-000000000006'],
  ['alumna.valen@gimnasio.test', '21000000-0000-4000-8000-000000000007'],
]);
const email = process.argv[2] ?? 'alumno.martin@gimnasio.test';
const userId = seedAccounts.get(email);
if (process.argv.length > 3 || !userId) {
  throw new Error('Choose one predefined local seed account email');
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(
      password,
      Number(process.env.PASSWORD_HASH_COST ?? 12),
    );
    const result = await prisma.user.updateMany({
      where: {
        id: userId,
        gymId: '10000000-0000-4000-8000-000000000001',
        emailNormalized: email,
      },
      data: { passwordHash },
    });
    if (result.count !== 1) {
      throw new Error(
        `Expected one local seed account for ${email}; updated ${result.count}`,
      );
    }
    console.log(`Configured local login for ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
