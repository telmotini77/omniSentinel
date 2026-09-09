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
      await this.assertAlertTopology(channel);
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

  async createChannel(): Promise<amqp.Channel> {
    return (await this.getConnection()).createChannel();
  }

  async assertAlertTopology(channel: amqp.Channel): Promise<void> {
    const eventsExchange = this.configService.getOrThrow<string>(
      'RABBITMQ_EVENTS_EXCHANGE',
    );
    const alertQueue = this.configService.getOrThrow<string>(
      'RABBITMQ_ALERT_QUEUE',
    );
    const retryQueue = this.configService.getOrThrow<string>(
      'RABBITMQ_ALERT_RETRY_QUEUE',
    );
    const deadLetterExchange = `${eventsExchange}.dlx`;
    const deadLetterQueue = `${eventsExchange}.dlq`;

    await channel.assertExchange(eventsExchange, 'topic', { durable: true });
    await channel.assertExchange(deadLetterExchange, 'topic', {
      durable: true,
    });
    await channel.assertQueue(deadLetterQueue, { durable: true });
    await channel.bindQueue(deadLetterQueue, deadLetterExchange, '#');
    await channel.assertQueue(alertQueue, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': deadLetterExchange },
    });
    await channel.bindQueue(alertQueue, eventsExchange, '#');
    await channel.assertQueue(retryQueue, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': eventsExchange },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }
}
