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

export interface ZasmaoltAdapter {
  getCustomersForPon(
    oltExternalId: string,
    ponIdentifier: string,
  ): Promise<ExternalCustomer[]>;
  checkHealth(): Promise<void>;
}

export const ZASMAOLT_ADAPTER = Symbol('ZASMAOLT_ADAPTER');
