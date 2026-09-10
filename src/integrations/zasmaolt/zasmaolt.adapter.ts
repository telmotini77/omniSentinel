import type { CustomerConnectionStatus } from '@prisma/client';

export interface ExternalCustomer {
  externalCustomerId: string;
  customerCode?: string;
  customerName?: string;
  onuSerial?: string;
  servicePlan?: string;
  serviceType?: string;
  status: CustomerConnectionStatus;
  rxPower?: number;
}

export type ExternalNapStatus = 'ONLINE' | 'PARTIAL' | 'OFFLINE' | 'UNKNOWN';

export interface ExternalNap {
  id: string;
  name: string;
  oltId: string;
  oltName: string;
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

export interface ZasmaoltAdapter {
  getCustomersForPon(
    oltExternalId: string,
    ponIdentifier: string,
  ): Promise<ExternalCustomer[]>;
  listNaps(query: ExternalNapQuery): Promise<ExternalNapPage>;
  checkHealth(): Promise<void>;
}

export const ZASMAOLT_ADAPTER = Symbol('ZASMAOLT_ADAPTER');
