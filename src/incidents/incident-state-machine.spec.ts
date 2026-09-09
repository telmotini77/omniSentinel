import { ConflictException } from '@nestjs/common';
import { IncidentStatus } from '@prisma/client';
import {
  assertIncidentTransition,
  isOpenIncidentStatus,
} from './incident-state-machine';

describe('incident state machine', () => {
  it('accepts the configured investigation workflow', () => {
    expect(() =>
      assertIncidentTransition(
        IncidentStatus.DETECTED,
        IncidentStatus.INVESTIGATING,
      ),
    ).not.toThrow();
    expect(() =>
      assertIncidentTransition(
        IncidentStatus.IN_PROGRESS,
        IncidentStatus.MONITORING,
      ),
    ).not.toThrow();
    expect(() =>
      assertIncidentTransition(IncidentStatus.RESOLVED, IncidentStatus.CLOSED),
    ).not.toThrow();
  });

  it('rejects skipped or terminal transitions', () => {
    expect(() =>
      assertIncidentTransition(
        IncidentStatus.DETECTED,
        IncidentStatus.RESOLVED,
      ),
    ).toThrow(ConflictException);
    expect(() =>
      assertIncidentTransition(
        IncidentStatus.CLOSED,
        IncidentStatus.IN_PROGRESS,
      ),
    ).toThrow(ConflictException);
  });

  it('identifies terminal and open incident states', () => {
    expect(isOpenIncidentStatus(IncidentStatus.IN_PROGRESS)).toBe(true);
    expect(isOpenIncidentStatus(IncidentStatus.RESOLVED)).toBe(false);
    expect(isOpenIncidentStatus(IncidentStatus.CLOSED)).toBe(false);
  });
});
