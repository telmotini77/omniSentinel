import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../common/decorators/permissions.decorator';
import { ListNapsQueryDto } from './dto/list-naps-query.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory')
@ApiBearerAuth('access-token')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('naps')
  @Permissions('incident.read')
  @ApiOperation({
    summary: 'Lists the current NAP inventory sourced from api_zaSmaOlt',
  })
  listNaps(@Query() query: ListNapsQueryDto) {
    return this.inventoryService.listNaps(query);
  }
}
