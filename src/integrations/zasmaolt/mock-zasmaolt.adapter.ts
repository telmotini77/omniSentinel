import { Injectable } from '@nestjs/common';
import { CustomerConnectionStatus } from '@prisma/client';
import type {
  ExternalCustomer,
  ExternalNapPage,
  ExternalNapQuery,
  ZasmaoltAdapter,
} from './zasmaolt.adapter';

@Injectable()
export class MockZasmaoltAdapter implements ZasmaoltAdapter {
  getCustomersForPon(
    oltExternalId: string,
    ponIdentifier: string,
  ): Promise<ExternalCustomer[]> {
    if (oltExternalId === 'OLT-CUE-01' && ponIdentifier === '1/4') {
      return Promise.resolve(
        Array.from({ length: 32 }, (_, index) => {
          const affected = index < 29;
          return {
            externalCustomerId: `mock-customer-${(index + 1).toString().padStart(3, '0')}`,
            customerCode: `CUE-${(index + 1).toString().padStart(4, '0')}`,
            customerName: `Mock Customer ${index + 1}`,
            onuSerial: `ZTEGC${(index + 1).toString().padStart(8, '0')}`,
            servicePlan: affected ? 'FTTH 300 Mbps' : 'FTTH 100 Mbps',
            serviceType: 'INTERNET',
            status: affected
              ? CustomerConnectionStatus.OFFLINE
              : CustomerConnectionStatus.ONLINE,
            rxPower: affected ? -40 : -22.4,
          };
        }),
      );
    }
    return Promise.resolve([]);
  }

  async checkHealth(): Promise<void> {
    return Promise.resolve();
  }

  listNaps(query: ExternalNapQuery): Promise<ExternalNapPage> {
    return Promise.resolve({
      data: [],
      total: 0,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      source: 'SMARTOLT_CACHE',
      cachedNaps: 0,
      refreshedAt: null,
      isStale: false,
    });
  }
}
