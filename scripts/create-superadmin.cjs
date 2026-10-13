// Crea (o actualiza la contraseña de) la cuenta SuperAdmin del proveedor (HU13).
//
// El SuperAdmin no pertenece a un gimnasio afiliado: vive en un gimnasio
// técnico marcado `is_platform`, que no aparece en el listado ni admite
// invitaciones. Así reutiliza el mismo login y la misma sesión que el resto.
//
// Uso:
//   SUPERADMIN_EMAIL=ops@proveedor.com SUPERADMIN_PASSWORD='...' \
//     npm run db:create-superadmin
//
// La contraseña nunca se imprime ni se registra.
require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const PLATFORM_GYM_NAME = 'Proveedor (plataforma)';

const email = (process.env.SUPERADMIN_EMAIL ?? '').trim().toLowerCase();
const password = process.env.SUPERADMIN_PASSWORD ?? '';
const displayName = (process.env.SUPERADMIN_NAME ?? 'Super Admin').trim();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Set SUPERADMIN_EMAIL to a valid email address');
}
if (
  password.length < 12 ||
  !/[A-Z]/.test(password) ||
  !/[a-z]/.test(password) ||
  !/[0-9]/.test(password)
) {
  throw new Error(
    'SUPERADMIN_PASSWORD needs 12+ characters with upper, lower case and a digit',
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(
      password,
      Number(process.env.PASSWORD_HASH_COST ?? 12),
    );

    await prisma.$transaction(async (tx) => {
      const gym =
        (await tx.gym.findFirst({ where: { isPlatform: true } })) ??
        (await tx.gym.create({
          data: {
            name: PLATFORM_GYM_NAME,
            timezone: 'America/Argentina/Buenos_Aires',
            isPlatform: true,
          },
        }));

      const user = await tx.user.upsert({
        where: {
          gymId_emailNormalized: { gymId: gym.id, emailNormalized: email },
        },
        create: {
          gymId: gym.id,
          emailNormalized: email,
          displayName,
          passwordHash,
          state: 'ACTIVO',
        },
        update: { passwordHash, state: 'ACTIVO' },
      });

      await tx.userRoleAssignment.upsert({
        where: { userId_role: { userId: user.id, role: 'SUPERADMIN' } },
        create: { userId: user.id, role: 'SUPERADMIN' },
        update: {},
      });
    });

    console.info(`SuperAdmin ready: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Unexpected error');
  process.exitCode = 1;
});
