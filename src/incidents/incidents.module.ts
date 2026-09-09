import { Module } from '@nestjs/common';
import { CorrelationModule } from '../correlation/correlation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IncidentEngineService } from './incident-engine.service';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

@Module({
  imports: [CorrelationModule, NotificationsModule],
  controllers: [IncidentsController],
  providers: [IncidentEngineService, IncidentsService],
  exports: [IncidentEngineService],
})
export class IncidentsModule {}
