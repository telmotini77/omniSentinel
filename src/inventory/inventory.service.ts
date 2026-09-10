import { Inject, Injectable } from '@nestjs/common';
import {
  ZASMAOLT_ADAPTER,
  type ExternalNapPage,
  type ZasmaoltAdapter,
} from '../integrations/zasmaolt/zasmaolt.adapter';
import type { ListNapsQueryDto } from './dto/list-naps-query.dto';

@Injectable()
export class InventoryService {
  constructor(
    @Inject(ZASMAOLT_ADAPTER)
    private readonly zasmaolt: ZasmaoltAdapter,
  ) {}

  listNaps(query: ListNapsQueryDto): Promise<ExternalNapPage> {
    return this.zasmaolt.listNaps(query);
  }
}
