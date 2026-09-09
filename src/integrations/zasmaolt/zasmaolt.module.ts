import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpZasmaoltAdapter } from './http-zasmaolt.adapter';
import { MockZasmaoltAdapter } from './mock-zasmaolt.adapter';
import { ZASMAOLT_ADAPTER } from './zasmaolt.adapter';

@Global()
@Module({
  providers: [
    HttpZasmaoltAdapter,
    MockZasmaoltAdapter,
    {
      provide: ZASMAOLT_ADAPTER,
      inject: [ConfigService, HttpZasmaoltAdapter, MockZasmaoltAdapter],
      useFactory: (
        configService: ConfigService,
        httpAdapter: HttpZasmaoltAdapter,
        mockAdapter: MockZasmaoltAdapter,
      ) =>
        configService.getOrThrow<string>('ZASMAOLT_ADAPTER_MODE') === 'http'
          ? httpAdapter
          : mockAdapter,
    },
  ],
  exports: [ZASMAOLT_ADAPTER],
})
export class ZasmaoltModule {}
