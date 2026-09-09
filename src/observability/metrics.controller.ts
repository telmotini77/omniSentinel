import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { MetricsAccessGuard } from './metrics-access.guard';
import { MetricsService } from './metrics.service';
import type { Response } from 'express';

@ApiTags('Observability')
@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  @Public()
  @UseGuards(MetricsAccessGuard)
  @ApiOperation({ summary: 'Exposes Prometheus metrics for scraping' })
  @ApiProduces('text/plain')
  async metrics(@Res() response: Response): Promise<void> {
    const exposition = await this.metricsService.exposition();
    response.setHeader('Content-Type', exposition.contentType);
    response.send(exposition.body);
  }
}
