import type { SettingsManifest } from '@pops/types';

/**
 * HA bridge settings manifest — published by the pillar so the central
 * settings UI / `discoverSettings` (ADR-037 / PRD-240) can render and
 * validate the bridge's retention knob.
 *
 * The history retention worker (`src/retention-worker.ts`) reads
 * `HA_HISTORY_RETENTION_DAYS` from env at boot. This descriptor declares
 * the same key + default + bounds so the setting is discoverable; the
 * `envFallback` hint tells consumers which env var the runtime currently
 * resolves from when no user-set value exists.
 */
export const HA_BRIDGE_RETENTION_SETTING_KEY = 'haBridge.historyRetentionDays' as const;
export const HA_BRIDGE_DEFAULT_RETENTION_DAYS = 30;

export const haBridgeSettingsManifest: SettingsManifest = {
  id: 'haBridge',
  title: 'Home Assistant Bridge',
  icon: 'Home',
  order: 230,
  groups: [
    {
      id: 'haBridgeRetention',
      title: 'History Retention',
      description:
        'How long the bridge keeps `ha_state_history` rows before the periodic retention worker prunes them. The current-state snapshot in `ha_entities` is never pruned.',
      fields: [
        {
          key: HA_BRIDGE_RETENTION_SETTING_KEY,
          label: 'History Retention (days)',
          type: 'number',
          default: String(HA_BRIDGE_DEFAULT_RETENTION_DAYS),
          description:
            'Rows in `ha_state_history` older than this many days are deleted on each retention tick. Set to 0 to disable pruning entirely.',
          validation: { min: 0, max: 3650 },
          envFallback: 'HA_HISTORY_RETENTION_DAYS',
          requiresRestart: true,
        },
      ],
    },
  ],
};
