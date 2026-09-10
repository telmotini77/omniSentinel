import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertConsumerService } from './alert-consumer.service';
import { AlertsService } from './alerts.service';
import { IntegrationApiKeyGuard } from './guards/integration-api-key.guard';
import { IncidentsModule } from '../incidents/incidents.module';
import { ImpactModule } from '../impact/impact.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ZasmaoltEventPullerService } from './zasmaolt-event-puller.service';

@Module({
  imports: [IncidentsModule, ImpactModule, NotificationsModule],
  controllers: [AlertsController],
  providers: [
    AlertsService,
    IntegrationApiKeyGuard,
    AlertConsumerService,
    ZasmaoltEventPullerService,
  ],
  exports: [AlertsService],
})
export class AlertsModule {}
