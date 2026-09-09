import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Checks the service and its infrastructure dependencies',
  })
  async check(): Promise<Awaited<ReturnType<HealthService['check']>>> {
    const result = await this.healthService.check();
    if (result.status !== 'healthy') {
      throw new ServiceUnavailableException({
        error: 'SERVICE_DEGRADED',
        message: 'One or more required dependencies are unavailable',
        ...result,
      });
    }
    return result;
  }
}
