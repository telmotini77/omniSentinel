import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerConnectionStatus } from '@prisma/client';
import { MetricsService } from '../../observability/metrics.service';
import type { ExternalCustomer, ZasmaoltAdapter } from './zasmaolt.adapter';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class HttpZasmaoltAdapter implements ZasmaoltAdapter {
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async getCustomersForPon(
    oltExternalId: string,
    ponIdentifier: string,
  ): Promise<ExternalCustomer[]> {
    const ponsResponse = await this.request(
      `/api/v1/olts/${encodeURIComponent(oltExternalId)}/pons`,
    );
    const pon = this.extractArray(ponsResponse).find((candidate) =>
      this.matchesPon(candidate, ponIdentifier),
    );
    const ponId = this.readString(pon, 'id');
    if (!ponId) {
      throw new ServiceUnavailableException({
        error: 'PON_NOT_FOUND_UPSTREAM',
        message: `The requested PON ${ponIdentifier} was not returned by api_zaSmaOlt`,
      });
    }
    const customersResponse = await this.request(
      `/api/v1/pons/${encodeURIComponent(ponId)}/customers`,
    );
    return this.extractArray(customersResponse).map((customer) =>
      this.mapCustomer(customer),
    );
  }

  async checkHealth(): Promise<void> {
    await this.request('', 'HEAD');
  }

  private async request(path: string, method = 'GET'): Promise<unknown> {
    this.ensureCircuitIsClosed();
    const startedAt = process.hrtime.bigint();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.configService.getOrThrow<number>('ZASMAOLT_TIMEOUT_MS'),
    );
    try {
      const baseUrl = this.configService
        .getOrThrow<string>('ZASMAOLT_API_URL')
        .replace(/\/$/, '');
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          [this.configService.getOrThrow<string>('ZASMAOLT_API_KEY_HEADER')]:
            this.configService.getOrThrow<string>('ZASMAOLT_API_KEY'),
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (response.status >= 500)
        throw new Error(`Upstream response ${response.status}`);
      if (!response.ok && method !== 'HEAD')
        throw new Error(`Upstream response ${response.status}`);
      this.consecutiveFailures = 0;
      this.metrics?.recordZasmaoltRequestDuration(
        this.elapsedSeconds(startedAt),
        method,
        'success',
      );
      return method === 'HEAD' ? undefined : response.json();
    } catch (error: unknown) {
      this.metrics?.recordZasmaoltRequestDuration(
        this.elapsedSeconds(startedAt),
        method,
        'failed',
      );
      this.consecutiveFailures += 1;
      if (
        this.consecutiveFailures >=
        this.configService.getOrThrow<number>(
          'ZASMAOLT_CIRCUIT_BREAKER_FAILURE_THRESHOLD',
        )
      ) {
        this.circuitOpenUntil =
          Date.now() +
          this.configService.getOrThrow<number>(
            'ZASMAOLT_CIRCUIT_BREAKER_RESET_SECONDS',
          ) *
            1_000;
      }
      throw new ServiceUnavailableException({
        error: 'ZASMAOLT_UNAVAILABLE',
        message: 'api_zaSmaOlt is unavailable',
        cause: error instanceof Error ? error.message : undefined,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private ensureCircuitIsClosed(): void {
    if (Date.now() < this.circuitOpenUntil) {
      throw new ServiceUnavailableException({
        error: 'ZASMAOLT_CIRCUIT_OPEN',
        message: 'api_zaSmaOlt circuit breaker is open',
      });
    }
  }

  private extractArray(value: unknown): JsonRecord[] {
    if (Array.isArray(value))
      return value.filter((item): item is JsonRecord => this.isRecord(item));
    if (!this.isRecord(value)) return [];
    const candidates = [value.data, value.items, value.results];
    const array = candidates.find(Array.isArray);
    return Array.isArray(array)
      ? array.filter((item): item is JsonRecord => this.isRecord(item))
      : [];
  }

  private matchesPon(pon: JsonRecord, identifier: string): boolean {
    if (this.readString(pon, 'identifier') === identifier) return true;
    const [board, port] = identifier.split('/');
    return (
      this.readString(pon, 'board') === board &&
      (this.readString(pon, 'pon') ?? this.readString(pon, 'port')) === port
    );
  }

  private mapCustomer(customer: JsonRecord): ExternalCustomer {
    const externalCustomerId =
      this.readString(customer, 'id') ??
      this.readString(customer, 'customerId');
    if (!externalCustomerId)
      throw new ServiceUnavailableException({
        error: 'INVALID_UPSTREAM_CUSTOMER',
        message: 'api_zaSmaOlt returned a customer without an identifier',
      });
    return {
      externalCustomerId,
      customerCode:
        this.readString(customer, 'code') ??
        this.readString(customer, 'customerCode'),
      customerName:
        this.readString(customer, 'name') ??
        this.readString(customer, 'customerName'),
      onuSerial:
        this.readString(customer, 'onuSerial') ??
        this.readString(customer, 'serial'),
      servicePlan:
        this.readString(customer, 'servicePlan') ??
        this.readString(customer, 'plan'),
      serviceType: this.readString(customer, 'serviceType'),
      status: this.mapStatus(this.readString(customer, 'status')),
      rxPower: this.readNumber(customer, 'rxPower'),
    };
  }

  private mapStatus(status: string | undefined): CustomerConnectionStatus {
    const normalized = status?.toUpperCase();
    if (['ONLINE', 'UP', 'ACTIVE', 'CONNECTED'].includes(normalized ?? ''))
      return CustomerConnectionStatus.ONLINE;
    if (
      ['OFFLINE', 'DOWN', 'LOS', 'DISCONNECTED', 'INACTIVE'].includes(
        normalized ?? '',
      )
    )
      return CustomerConnectionStatus.OFFLINE;
    return CustomerConnectionStatus.UNKNOWN;
  }

  private readString(
    record: JsonRecord | undefined,
    key: string,
  ): string | undefined {
    const value = record?.[key];
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : undefined;
  }

  private readNumber(record: JsonRecord, key: string): number | undefined {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private elapsedSeconds(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
  }
}
