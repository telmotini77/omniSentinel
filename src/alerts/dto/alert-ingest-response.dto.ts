import { ApiProperty } from '@nestjs/swagger';

export class AlertIngestResponseDto {
  @ApiProperty({ enum: ['created', 'duplicate'] })
  result!: 'created' | 'duplicate';

  @ApiProperty({ format: 'uuid' })
  alertId!: string;

  @ApiProperty({ example: 'evt-983472' })
  externalEventId!: string;
}
