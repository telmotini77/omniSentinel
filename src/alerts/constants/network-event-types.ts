export const NETWORK_EVENT_TYPES = [
  'onu.offline',
  'onu.online',
  'onu.los',
  'onu.power_fail',
  'onu.signal.warning',
  'onu.signal.critical',
  'pon.down',
  'pon.up',
  'olt.down',
  'olt.up',
  'uplink.down',
  'uplink.up',
  'zabbix.problem.created',
  'zabbix.problem.resolved',
] as const;

export type NetworkEventType = (typeof NETWORK_EVENT_TYPES)[number];
