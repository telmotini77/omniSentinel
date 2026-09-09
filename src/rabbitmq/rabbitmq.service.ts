import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitMqService implements OnModuleDestroy {
  private connection?: amqp.ChannelModel;
  private connecting?: Promise<amqp.ChannelModel>;

  constructor(private readonly configService: ConfigService) {}

  private async getConnection(): Promise<amqp.ChannelModel> {
    if (this.connection) return this.connection;
    this.connecting ??= amqp.connect(
      this.configService.getOrThrow<string>('RABBITMQ_URL'),
    );
    this.connection = await this.connecting;
    this.connection.on('close', () => {
      this.connection = undefined;
      this.connecting = undefined;
    });
    return this.connection;
  }

  async assertInfrastructure(): Promise<void> {
    const connection = await this.getConnection();
    const channel = await connection.createChannel();
    try {
      await channel.assertExchange(
        this.configService.getOrThrow<string>('RABBITMQ_EVENTS_EXCHANGE'),
        'topic',
        { durable: true },
      );
      await channel.assertQueue(
        this.configService.getOrThrow<string>('RABBITMQ_HEALTH_QUEUE'),
        {
          durable: true,
        },
      );
    } finally {
      await channel.close();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }
}
