import { Module } from '@nestjs/common';
import { ImpactController } from './impact.controller';
import { ImpactEngineService } from './impact-engine.service';

@Module({
  controllers: [ImpactController],
  providers: [ImpactEngineService],
  exports: [ImpactEngineService],
})
export class ImpactModule {}
