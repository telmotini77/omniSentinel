export const NETWORK_EVENT_TYPES = [
  'pon.los',
  'fiber.cut',
] as const;

export type NetworkEventType = (typeof NETWORK_EVENT_TYPES)[number];

/** Event types intentionally retained in OmniSentinel's operational views. */
export const APPROVED_ALERT_EVENT_TYPES: NetworkEventType[] = [
  ...NETWORK_EVENT_TYPES,
];
