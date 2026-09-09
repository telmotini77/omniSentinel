import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const permissions = [
  ['incident.read', 'View incidents and incident data'],
  ['incident.update', 'Update incident investigation data'],
  ['incident.assign', 'Assign incidents to operators or technicians'],
  ['incident.resolve', 'Resolve incidents'],
  ['incident.close', 'Close incidents'],
  ['report.read', 'View and download reports'],
  ['report.generate', 'Generate reports'],
  ['statistics.read', 'View statistics and SLA'],
  ['configuration.update', 'Change system configuration'],
  ['user.read', 'View users and role assignments'],
  ['user.manage', 'Create users and manage their roles'],
] as const;

const rolePermissions: Record<string, readonly string[]> = {
  ADMIN: permissions.map(([name]) => name),
  NOC_SUPERVISOR: [
    'incident.read',
    'incident.update',
    'incident.assign',
    'incident.resolve',
    'incident.close',
    'report.read',
    'report.generate',
    'statistics.read',
  ],
  NOC_OPERATOR: ['incident.read', 'incident.update', 'report.read', 'statistics.read'],
  TECHNICIAN: ['incident.read', 'incident.update'],
  AUDITOR: ['incident.read', 'report.read', 'statistics.read', 'user.read'],
  VIEWER: ['incident.read', 'report.read', 'statistics.read'],
};

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

  const permissionRecords = await Promise.all(
    permissions.map(async ([name, description]) =>
      prisma.permission.upsert({
        where: { name },
        update: { description },
        create: { name, description },
      }),
    ),
  );
  const permissionsByName = new Map(permissionRecords.map((permission) => [permission.name, permission]));

  for (const [name, assignedPermissions] of Object.entries(rolePermissions)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: name.replaceAll('_', ' ') },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: assignedPermissions.map((permissionName) => ({
        roleId: role.id,
        permissionId: permissionsByName.get(permissionName)?.id ?? '',
      })),
    });
  }

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@omnisentinel.local';
  const adminUsername = process.env.ADMIN_USERNAME ?? 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) throw new Error('ADMIN_PASSWORD is required to seed the first administrator');

  const administratorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
  const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
  const existingAdministrator = await prisma.user.findFirst({
    where: { OR: [{ email: adminEmail }, { username: adminUsername }] },
  });
  const administrator = existingAdministrator
    ? await prisma.user.update({
        where: { id: existingAdministrator.id },
        data: {
          email: adminEmail,
          username: adminUsername,
          displayName: 'System Administrator',
          status: 'ACTIVE',
        },
      })
    : await prisma.user.create({
        data: {
          email: adminEmail,
          username: adminUsername,
          displayName: 'System Administrator',
          passwordHash,
          status: 'ACTIVE',
        },
      });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: administrator.id, roleId: administratorRole.id } },
    update: {},
    create: { userId: administrator.id, roleId: administratorRole.id },
  });
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
