export const SYSTEM_ROLE_NAMES = [
  'ADMIN',
  'NOC_SUPERVISOR',
  'NOC_OPERATOR',
  'TECHNICIAN',
  'AUDITOR',
  'VIEWER',
] as const;

export type SystemRoleName = (typeof SYSTEM_ROLE_NAMES)[number];
