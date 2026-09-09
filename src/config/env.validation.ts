import * as Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
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
  ZASMAOLT_API_KEY: Joi.string().allow('').optional(),
  REPORT_STORAGE_PATH: Joi.string().default('./storage/reports'),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().port().default(1025),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASSWORD: Joi.string().allow('').optional(),
  INCIDENT_CORRELATION_WINDOW_SECONDS: Joi.number()
    .integer()
    .positive()
    .default(60),
  INCIDENT_STABILIZATION_MINUTES: Joi.number().integer().positive().default(5),
});
