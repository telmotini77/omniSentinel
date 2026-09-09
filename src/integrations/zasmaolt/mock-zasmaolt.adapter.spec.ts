import { CustomerConnectionStatus } from '@prisma/client';
import { MockZasmaoltAdapter } from './mock-zasmaolt.adapter';

describe('MockZasmaoltAdapter', () => {
  const adapter = new MockZasmaoltAdapter();

  it('provides the documented development impact scenario', async () => {
    const customers = await adapter.getCustomersForPon('OLT-CUE-01', '1/4');

    expect(customers).toHaveLength(32);
    expect(
      customers.filter(
        (customer) => customer.status === CustomerConnectionStatus.OFFLINE,
      ),
    ).toHaveLength(29);
    expect(
      customers.filter(
        (customer) => customer.status === CustomerConnectionStatus.ONLINE,
      ),
    ).toHaveLength(3);
  });

  it('does not invent customer data for an unknown PON', async () => {
    await expect(
      adapter.getCustomersForPon('OLT-CUE-01', '1/99'),
    ).resolves.toEqual([]);
  });
});
