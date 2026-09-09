import type { SlaScope } from '@prisma/client';

export interface SlaPeriod {
  start: Date;
  end: Date;
}

export interface SlaCalculation {
  scope: SlaScope;
  scopeKey: string;
  periodStart: Date;
  periodEnd: Date;
  totalMinutes: number;
  downtimeMinutes: number;
  availabilityPercentage: number;
  incidentCount: number;
  mttrMinutes: number | null;
  mtbfMinutes: number | null;
}

export interface DowntimeInterval {
  start: Date;
  end: Date;
}
