import { ConflictException } from '@nestjs/common';
import { IncidentStatus } from '@prisma/client';

const transitions: Record<IncidentStatus, readonly IncidentStatus[]> = {
  DETECTED: [IncidentStatus.INVESTIGATING, IncidentStatus.FALSE_POSITIVE],
  INVESTIGATING: [IncidentStatus.CONFIRMED, IncidentStatus.FALSE_POSITIVE],
  CONFIRMED: [IncidentStatus.IN_PROGRESS, IncidentStatus.FALSE_POSITIVE],
  IN_PROGRESS: [IncidentStatus.MONITORING, IncidentStatus.RESOLVED],
  MONITORING: [IncidentStatus.IN_PROGRESS, IncidentStatus.RESOLVED],
  RESOLVED: [IncidentStatus.IN_PROGRESS, IncidentStatus.CLOSED],
  CLOSED: [],
  FALSE_POSITIVE: [],
};

export function assertIncidentTransition(
  from: IncidentStatus,
  to: IncidentStatus,
): void {
  if (!transitions[from].includes(to)) {
    throw new ConflictException({
      error: 'INVALID_INCIDENT_TRANSITION',
      message: `Cannot transition an incident from ${from} to ${to}`,
    });
  }
}

export function isOpenIncidentStatus(status: IncidentStatus): boolean {
  const terminalStatuses: IncidentStatus[] = [
    IncidentStatus.RESOLVED,
    IncidentStatus.CLOSED,
    IncidentStatus.FALSE_POSITIVE,
  ];
  return !terminalStatuses.includes(status);
}
