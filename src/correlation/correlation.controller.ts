import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CorrelationRule } from '@prisma/client';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CorrelationRulesService } from './correlation-rules.service';
import { CreateCorrelationRuleDto } from './dto/create-correlation-rule.dto';
import { UpdateCorrelationRuleDto } from './dto/update-correlation-rule.dto';

@ApiTags('Correlation rules')
@ApiBearerAuth('access-token')
@Controller('correlation/rules')
@Permissions('configuration.update')
export class CorrelationController {
  constructor(private readonly correlationRules: CorrelationRulesService) {}

  @Get()
  @ApiOperation({ summary: 'Lists persisted correlation and severity rules' })
  list(): Promise<CorrelationRule[]> {
    return this.correlationRules.list();
  }

  @Post()
  @ApiOperation({ summary: 'Creates a correlation or severity rule' })
  create(@Body() dto: CreateCorrelationRuleDto): Promise<CorrelationRule> {
    return this.correlationRules.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Updates a persisted correlation rule' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCorrelationRuleDto,
  ): Promise<CorrelationRule> {
    return this.correlationRules.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletes a correlation rule' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.correlationRules.remove(id);
  }
}
