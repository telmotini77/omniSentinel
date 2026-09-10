import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerConnectionStatus } from '@prisma/client';
import { MetricsService } from '../../observability/metrics.service';
import type {
  ExternalCustomer,
  ExternalNap,
  ExternalNapPage,
  ExternalNapQuery,
  ExternalNapStatus,
  ZasmaoltAdapter,
} from './zasmaolt.adapter';

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
    const [board, pon] = ponIdentifier.split('/');
    if (!this.isPortPart(board) || !this.isPortPart(pon)) {
      throw new ServiceUnavailableException({
        error: 'INVALID_PON_IDENTIFIER',
        message: `PON identifier ${ponIdentifier} must use the board/port format`,
      });
    }
    const customersResponse = await this.request(
      `/integration/v1/impact/olts/${encodeURIComponent(oltExternalId)}/pons/${encodeURIComponent(board)}/${encodeURIComponent(pon)}/customers`,
    );
    return this.extractArray(customersResponse).map((customer) =>
      this.mapCustomer(customer),
    );
  }

  async checkHealth(): Promise<void> {
    await this.request('/integration/v1/health');
  }

  async listNaps(query: ExternalNapQuery): Promise<ExternalNapPage> {
    const parameters = new URLSearchParams();
    if (query.page) parameters.set('page', String(query.page));
    if (query.limit) parameters.set('limit', String(query.limit));
    if (query.search) parameters.set('search', query.search);
    if (query.oltId) parameters.set('oltId', query.oltId);
    if (query.status) parameters.set('status', query.status);
    const suffix = parameters.size ? `?${parameters.toString()}` : '';
    const response = await this.request(
      `/integration/v1/inventory/naps${suffix}`,
    );
    if (!this.isRecord(response)) {
      throw new ServiceUnavailableException({
        error: 'INVALID_UPSTREAM_INVENTORY',
        message: 'api_zaSmaOlt returned an invalid inventory response',
      });
    }
    const data = this.extractArray(response).map((nap) => this.mapNap(nap));
    return {
      data,
      total: this.readPositiveInteger(response, 'total', data.length),
      page: this.readPositiveInteger(response, 'page', query.page ?? 1),
      limit: this.readPositiveInteger(
        response,
        'limit',
        query.limit ?? data.length,
      ),
      source: 'SMARTOLT_CACHE',
      cachedNaps:
        this.readNonNegativeInteger(response, 'cachedNaps', data.length) ??
        data.length,
      refreshedAt: this.readString(response, 'refreshedAt') ?? null,
      isStale: response.isStale === true,
    };
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

  private isPortPart(value: string | undefined): value is string {
    return Boolean(value && /^\d+$/.test(value));
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

  private mapNap(nap: JsonRecord): ExternalNap {
    const id = this.readString(nap, 'id');
    const name = this.readString(nap, 'name');
    const oltId = this.readString(nap, 'oltId');
    if (!id || !name || !oltId) {
      throw new ServiceUnavailableException({
        error: 'INVALID_UPSTREAM_INVENTORY',
        message: 'api_zaSmaOlt returned a NAP without its required identity',
      });
    }
    const status = this.readString(nap, 'status')?.toUpperCase();
    const safeStatus: ExternalNapStatus = [
      'ONLINE',
      'PARTIAL',
      'OFFLINE',
    ].includes(status ?? '')
      ? (status as ExternalNapStatus)
      : 'UNKNOWN';
    const latitude = this.readNumber(nap, 'latitude');
    const longitude = this.readNumber(nap, 'longitude');
    return {
      id,
      name,
      oltId,
      oltName: this.readString(nap, 'oltName') ?? oltId,
      board: this.readNonNegativeInteger(nap, 'board'),
      pon: this.readNonNegativeInteger(nap, 'pon'),
      status: safeStatus,
      totalClients: this.readNonNegativeInteger(nap, 'totalClients', 0) ?? 0,
      onlineClients: this.readNonNegativeInteger(nap, 'onlineClients', 0) ?? 0,
      offlineClients:
        this.readNonNegativeInteger(nap, 'offlineClients', 0) ?? 0,
      ...(latitude !== undefined && longitude !== undefined
        ? { latitude, longitude }
        : {}),
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

  private readNonNegativeInteger(
    record: JsonRecord,
    key: string,
    fallback?: number,
  ): number | undefined {
    const value = record[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
      return fallback;
    return value;
  }

  private readPositiveInteger(
    record: JsonRecord,
    key: string,
    fallback: number,
  ): number {
    const value = this.readNonNegativeInteger(record, key);
    return value && value > 0 ? value : fallback;
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private elapsedSeconds(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
  }
}
