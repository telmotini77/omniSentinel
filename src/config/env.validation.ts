import * as Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),
  CORS_ORIGINS: Joi.string()
    .custom((value: unknown, helpers) => {
      if (typeof value !== 'string') return helpers.error('any.invalid');
      const origins = value
        .split(',')
        .map((origin: string) => origin.trim())
        .filter(Boolean);
      if (!origins.length || origins.includes('*'))
        return helpers.error('any.invalid');
      return value;
    })
    .default('http://localhost:3000'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  RABBITMQ_URL: Joi.string()
    .uri({ scheme: ['amqp', 'amqps'] })
    .required(),
  RABBITMQ_EVENTS_EXCHANGE: Joi.string().default('network.events'),
  RABBITMQ_HEALTH_QUEUE: Joi.string().default('api_incident_report.health'),
  ZASMAOLT_API_URL: Joi.string().uri().required(),
  ZASMAOLT_API_KEY: Joi.string().min(24).required(),
  ZASMAOLT_ADAPTER_MODE: Joi.string().valid('mock', 'http').default('mock'),
  ZASMAOLT_API_KEY_HEADER: Joi.string().default('x-api-key'),
  ZASMAOLT_TIMEOUT_MS: Joi.number().integer().min(500).default(5_000),
  ZASMAOLT_CIRCUIT_BREAKER_FAILURE_THRESHOLD: Joi.number()
    .integer()
    .min(1)
    .default(3),
  ZASMAOLT_CIRCUIT_BREAKER_RESET_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(30),
  REPORT_STORAGE_PATH: Joi.string().default('./storage/reports'),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TOKEN_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().positive().default(7),
  ADMIN_EMAIL: Joi.string().email().required(),
  ADMIN_USERNAME: Joi.string().alphanum().min(3).max(50).required(),
  ADMIN_PASSWORD: Joi.string().min(12).required(),
  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().port().default(1025),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASSWORD: Joi.string().allow('').optional(),
  SMTP_FROM: Joi.string()
    .email({ tlds: { allow: false } })
    .default('no-reply@omnisentinel.local'),
  NOTIFICATION_EMAIL_RECIPIENTS: Joi.string().allow('').default(''),
  NOTIFICATION_WEBHOOK_TIMEOUT_MS: Joi.number()
    .integer()
    .min(500)
    .default(5_000),
  INCIDENT_CORRELATION_WINDOW_SECONDS: Joi.number()
    .integer()
    .positive()
    .default(60),
  INCIDENT_STABILIZATION_MINUTES: Joi.number().integer().positive().default(5),
  RATE_LIMIT_TTL_SECONDS: Joi.number().integer().positive().default(60),
  RATE_LIMIT_LIMIT: Joi.number().integer().positive().default(100),
  SWAGGER_ENABLED: Joi.boolean().optional(),
  METRICS_ENABLED: Joi.boolean().optional(),
  METRICS_BEARER_TOKEN: Joi.string()
    .allow('')
    .when('METRICS_ENABLED', {
      is: true,
      then: Joi.when('NODE_ENV', {
        is: 'production',
        then: Joi.string().min(32).required(),
        otherwise: Joi.string().allow('').optional(),
      }),
      otherwise: Joi.string().allow('').optional(),
    }),
  TRUST_PROXY: Joi.boolean().default(false),
  RABBITMQ_ALERT_QUEUE: Joi.string().default('api_incident_report.alerts'),
  RABBITMQ_ALERT_RETRY_QUEUE: Joi.string().default(
    'api_incident_report.alerts.retry',
  ),
  RABBITMQ_MAX_RETRIES: Joi.number().integer().min(0).max(10).default(3),
  RABBITMQ_RETRY_DELAY_MS: Joi.number().integer().min(1_000).default(5_000),
  ALERT_DEDUPLICATION_TTL_SECONDS: Joi.number()
    .integer()
    .positive()
    .default(86_400),
});
