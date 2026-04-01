import 'dotenv/config';
import { hash } from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '@prisma/client';

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const demoPassword = await hash('Ohmeria2026!', 10);

  await prisma.user.upsert({
    where: { email: 'admin@ohmeria.com' },
    update: {
      firstName: 'Mariana',
      lastName: 'Lopez',
      phone: '3001234567',
      role: Role.ADMIN,
      passwordHash: demoPassword,
      staffProfile: {
        upsert: {
          create: {
            title: 'Administradora general',
            bio: 'Gestión operativa y administrativa de Ohmeria.',
            isAvailable: true,
          },
          update: {
            title: 'Administradora general',
            bio: 'Gestión operativa y administrativa de Ohmeria.',
            isAvailable: true,
          },
        },
      },
    },
    create: {
      email: 'admin@ohmeria.com',
      passwordHash: demoPassword,
      firstName: 'Mariana',
      lastName: 'Lopez',
      phone: '3001234567',
      role: Role.ADMIN,
      staffProfile: {
        create: {
          title: 'Administradora general',
          bio: 'Gestión operativa y administrativa de Ohmeria.',
          isAvailable: true,
        },
      },
    },
  });

  await prisma.user.upsert({
    where: { email: 'doctor@ohmeria.com' },
    update: {
      firstName: 'Alejandro',
      lastName: 'Vargas',
      phone: '3109876543',
      role: Role.DOCTOR,
      passwordHash: demoPassword,
      staffProfile: {
        upsert: {
          create: {
            title: 'Doctor de medicina general',
            bio: 'Consulta médica general, chequeos preventivos y seguimiento clínico.',
            isAvailable: true,
          },
          update: {
            title: 'Doctor de medicina general',
            bio: 'Consulta médica general, chequeos preventivos y seguimiento clínico.',
            isAvailable: true,
          },
        },
      },
    },
    create: {
      email: 'doctor@ohmeria.com',
      passwordHash: demoPassword,
      firstName: 'Alejandro',
      lastName: 'Vargas',
      phone: '3109876543',
      role: Role.DOCTOR,
      staffProfile: {
        create: {
          title: 'Doctor de medicina general',
          bio: 'Consulta médica general, chequeos preventivos y seguimiento clínico.',
          isAvailable: true,
        },
      },
    },
  });

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
