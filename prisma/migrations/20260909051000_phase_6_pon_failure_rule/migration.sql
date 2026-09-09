UPDATE "correlation_rules"
SET
  "rootCause" = 'PON_FAILURE',
  "description" = 'Ten distinct ONU offline events on the same PON within the correlation window indicate a possible PON failure.',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'multiple-onu-on-a-pon';
