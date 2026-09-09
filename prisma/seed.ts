import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'incident.severity.rules' },
    update: {},
    create: {
      key: 'incident.severity.rules',
      value: {
        customerThresholds: [
          { min: 1, max: 1, severity: 'MINOR' },
          { min: 2, max: 10, severity: 'MAJOR' },
          { min: 11, max: 50, severity: 'CRITICAL' },
          { min: 51, severity: 'DISASTER' },
        ],
      },
    },
  });
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
