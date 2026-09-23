import type { CustomerConnectionStatus } from '@prisma/client';
import type { NormalizedNetworkEventDto } from '../../alerts/dto/normalized-network-event.dto';

export interface ExternalCustomer {
  externalCustomerId: string;
  customerCode?: string;
  customerName?: string;
  onuSerial?: string;
  servicePlan?: string;
  serviceType?: string;
  status: CustomerConnectionStatus;
  rxPower?: number;
  napName?: string;
  oltAccountId?: string;
  oltSubdomain?: string;
}

export type ExternalNapStatus = 'ONLINE' | 'PARTIAL' | 'OFFLINE' | 'UNKNOWN';

export interface ExternalNap {
  id: string;
  name: string;
  oltId: string;
  oltName: string;
  oltAccountId?: string;
  oltSubdomain?: string;
  board?: number;
  pon?: number;
  status: ExternalNapStatus;
  totalClients: number;
  onlineClients: number;
  offlineClients: number;
  latitude?: number;
  longitude?: number;
}

export interface ExternalNapQuery {
  page?: number;
  limit?: number;
  search?: string;
  oltId?: string;
  status?: ExternalNapStatus;
}

export interface ExternalNapPage {
  data: ExternalNap[];
  total: number;
  page: number;
  limit: number;
  source: 'SMARTOLT_CACHE';
  cachedNaps: number;
  refreshedAt: string | null;
  isStale: boolean;
}

/** A source-owned cursor lets OmniSentinel resume after a local restart. */
export interface ExternalOperationalEvent {
  cursor: number;
  event: NormalizedNetworkEventDto;
}

export interface ExternalOperationalEventPage {
  data: ExternalOperationalEvent[];
  nextCursor: number;
  hasMore: boolean;
  /** Highest source cursor, even when this page has no rows. */
  latestCursor?: number;
}

export interface ZasmaoltAdapter {
  getCustomersForPon(
    oltExternalId: string,
    ponIdentifier: string,
    smartOltAccountId?: string,
  ): Promise<ExternalCustomer[]>;
  listNaps(query: ExternalNapQuery): Promise<ExternalNapPage>;
  listOperationalEvents(
    after: number,
    limit: number,
  ): Promise<ExternalOperationalEventPage>;
  checkHealth(): Promise<void>;
}

export const ZASMAOLT_ADAPTER = Symbol('ZASMAOLT_ADAPTER');
