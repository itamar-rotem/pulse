import { describe, it, expect } from 'vitest';
import {
  formatSlackPayload,
  formatDiscordPayload,
  getChannelPayload,
  getTestPayload,
} from '../src/services/intelligence/notification-channels.js';
import type { Alert } from '@pulse/shared';

const mockAlert: Alert = {
  id: 'alert-1',
  type: 'RULE_BREACH',
  severity: 'CRITICAL',
  title: 'Budget exceeded on project Alpha',
  message: 'Monthly spend $150.00 exceeds cap of $100',
  metadata: {},
  status: 'ACTIVE',
  createdAt: '2026-04-12T10:00:00Z',
  readAt: null,
  dismissedAt: null,
  sessionId: null,
  ruleId: 'rule-1',
  insightId: null,
  orgId: 'org-1',
} as Alert;

describe('notification-channels', () => {
  describe('formatSlackPayload', () => {
    it('produces valid Slack Block Kit JSON', () => {
      const raw = formatSlackPayload(mockAlert);
      const payload = JSON.parse(raw);

      expect(payload.text).toContain('Budget exceeded');
      expect(payload.attachments).toHaveLength(1);
      expect(payload.attachments[0].color).toBe('#ef4444'); // CRITICAL = red
      expect(payload.attachments[0].blocks).toHaveLength(2);
      expect(payload.attachments[0].blocks[0].type).toBe('section');
      expect(payload.attachments[0].blocks[0].text.type).toBe('mrkdwn');
      expect(payload.attachments[0].blocks[0].text.text).toContain('$150.00');
    });

    it('uses warning color for WARNING severity', () => {
      const warning = { ...mockAlert, severity: 'WARNING' as const };
      const payload = JSON.parse(formatSlackPayload(warning));
      expect(payload.attachments[0].color).toBe('#f59e0b');
    });

    it('includes emoji in fallback text', () => {
      const payload = JSON.parse(formatSlackPayload(mockAlert));
      expect(payload.text).toContain(':rotating_light:');
    });
  });

  describe('formatDiscordPayload', () => {
    it('produces valid Discord embed JSON', () => {
      const raw = formatDiscordPayload(mockAlert);
      const payload = JSON.parse(raw);

      expect(payload.embeds).toHaveLength(1);
      expect(payload.embeds[0].title).toContain('Budget exceeded');
      expect(payload.embeds[0].description).toContain('$150.00');
      expect(payload.embeds[0].color).toBe(0xef4444); // CRITICAL red as int
      expect(payload.embeds[0].fields).toHaveLength(2);
      expect(payload.embeds[0].fields[0]).toEqual({ name: 'Type', value: 'RULE_BREACH', inline: true });
      expect(payload.embeds[0].footer.text).toBe('Pulse Alert');
      expect(payload.embeds[0].timestamp).toBe('2026-04-12T10:00:00Z');
    });
  });

  describe('getChannelPayload', () => {
    it('returns Slack format for SLACK channel', () => {
      const { body, contentType } = getChannelPayload('SLACK', mockAlert);
      const parsed = JSON.parse(body);
      expect(contentType).toBe('application/json');
      expect(parsed.attachments).toBeDefined(); // Slack-specific
    });

    it('returns Discord format for DISCORD channel', () => {
      const { body, contentType } = getChannelPayload('DISCORD', mockAlert);
      const parsed = JSON.parse(body);
      expect(contentType).toBe('application/json');
      expect(parsed.embeds).toBeDefined(); // Discord-specific
    });

    it('returns generic JSON for CUSTOM channel', () => {
      const { body, contentType } = getChannelPayload('CUSTOM', mockAlert);
      const parsed = JSON.parse(body);
      expect(contentType).toBe('application/json');
      expect(parsed.event).toBe('RULE_BREACH');
      expect(parsed.alert.id).toBe('alert-1');
      expect(parsed.timestamp).toBeDefined();
    });
  });

  describe('getTestPayload', () => {
    it('returns Slack test payload', () => {
      const raw = getTestPayload('SLACK');
      const parsed = JSON.parse(raw);
      expect(parsed.text).toContain('Pulse webhook test');
      expect(parsed.attachments).toBeDefined();
    });

    it('returns Discord test payload', () => {
      const raw = getTestPayload('DISCORD');
      const parsed = JSON.parse(raw);
      expect(parsed.embeds[0].title).toContain('Pulse webhook test');
    });

    it('returns CUSTOM test payload', () => {
      const raw = getTestPayload('CUSTOM');
      const parsed = JSON.parse(raw);
      expect(parsed.event).toBe('SYSTEM');
      expect(parsed.alert.title).toContain('Pulse webhook test');
    });
  });
});
