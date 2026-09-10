import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(configService: ConfigService) {
    this.client = new Redis(configService.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }

  async ping(): Promise<void> {
    if (this.client.status === 'wait') await this.client.connect();
    await this.client.ping();
  }

  async setIfAbsent(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (this.client.status === 'wait') await this.client.connect();
    return (await this.client.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.client.status === 'wait') await this.client.connect();
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    if (this.client.status === 'wait') await this.client.connect();
    return this.client.get(key);
  }

  async setPersistent(key: string, value: string): Promise<void> {
    if (this.client.status === 'wait') await this.client.connect();
    await this.client.set(key, value);
  }

  async delete(key: string): Promise<void> {
    if (this.client.status === 'wait') await this.client.connect();
    await this.client.del(key);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'wait' || this.client.status === 'end') return;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
