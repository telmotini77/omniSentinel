import { Module } from '@nestjs/common';
import { CorrelationController } from './correlation.controller';
import { CorrelationEngineService } from './correlation-engine.service';
import { CorrelationRulesService } from './correlation-rules.service';

@Module({
  controllers: [CorrelationController],
  providers: [CorrelationEngineService, CorrelationRulesService],
  exports: [CorrelationEngineService],
})
export class CorrelationModule {}
