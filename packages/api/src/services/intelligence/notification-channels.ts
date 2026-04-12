import type { Alert } from '@pulse/shared';

/**
 * Channel-specific payload formatters for Slack and Discord.
 *
 * CUSTOM webhooks continue to use the existing JSON payload with HMAC
 * signature. SLACK and DISCORD webhooks use their native incoming
 * webhook format — no receiver code needed on the user's side.
 */

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  WARNING: '#f59e0b',
  INFO: '#3b82f6',
};

const SEVERITY_EMOJI: Record<string, string> = {
  CRITICAL: ':rotating_light:',
  WARNING: ':warning:',
  INFO: ':information_source:',
};

/**
 * Format an alert for Slack's Block Kit incoming webhook format.
 * https://api.slack.com/messaging/webhooks
 */
export function formatSlackPayload(alert: Alert): string {
  const color = SEVERITY_COLORS[alert.severity] ?? '#6b7280';
  const emoji = SEVERITY_EMOJI[alert.severity] ?? ':bell:';

  return JSON.stringify({
    text: `${emoji} ${alert.title}`,
    attachments: [
      {
        color,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${alert.title}*\n${alert.message}`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `*Type:* ${alert.type} | *Severity:* ${alert.severity} | *Time:* <!date^${Math.floor(new Date(alert.createdAt).getTime() / 1000)}^{date_short_pretty} at {time}|${alert.createdAt}>`,
              },
            ],
          },
        ],
      },
    ],
  });
}

/**
 * Format an alert for Discord's webhook embed format.
 * https://discord.com/developers/docs/resources/webhook
 */
export function formatDiscordPayload(alert: Alert): string {
  const color = parseInt((SEVERITY_COLORS[alert.severity] ?? '#6b7280').replace('#', ''), 16);

  return JSON.stringify({
    content: null,
    embeds: [
      {
        title: `${alert.title}`,
        description: alert.message,
        color,
        fields: [
          { name: 'Type', value: alert.type, inline: true },
          { name: 'Severity', value: alert.severity, inline: true },
        ],
        footer: {
          text: 'Pulse Alert',
        },
        timestamp: alert.createdAt,
      },
    ],
  });
}

/**
 * Get the formatted payload and headers for a given channel.
 */
export function getChannelPayload(
  channel: 'CUSTOM' | 'SLACK' | 'DISCORD',
  alert: Alert,
): { body: string; contentType: string } {
  switch (channel) {
    case 'SLACK':
      return { body: formatSlackPayload(alert), contentType: 'application/json' };
    case 'DISCORD':
      return { body: formatDiscordPayload(alert), contentType: 'application/json' };
    default:
      // CUSTOM uses the existing buildPayload format from webhook-service
      return {
        body: JSON.stringify({
          event: alert.type,
          alert: {
            id: alert.id,
            type: alert.type,
            severity: alert.severity,
            title: alert.title,
            message: alert.message,
            metadata: alert.metadata,
          },
          timestamp: new Date().toISOString(),
        }),
        contentType: 'application/json',
      };
  }
}

/**
 * Get the test payload for a given channel.
 */
export function getTestPayload(
  channel: 'CUSTOM' | 'SLACK' | 'DISCORD',
): string {
  const testAlert = {
    id: 'test',
    type: 'SYSTEM' as const,
    severity: 'INFO' as const,
    title: 'Pulse webhook test',
    message: 'This is a test notification from Pulse. If you see this, your integration is working.',
    metadata: {},
    createdAt: new Date().toISOString(),
  } as unknown as Alert;

  return getChannelPayload(channel, testAlert).body;
}
