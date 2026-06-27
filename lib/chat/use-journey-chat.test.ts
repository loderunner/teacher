import { describe, expect, it, vi } from 'vitest';

vi.mock('client-only', () => ({}));

import { prepareChatRequest } from './use-journey-chat';

const userMessage = {
  id: 'u1',
  role: 'user' as const,
  parts: [{ type: 'text' as const, text: 'Hello' }],
};

describe('prepareChatRequest', () => {
  describe('regenerate-message trigger', () => {
    it('returns regenerateFromMessageId', () => {
      const result = prepareChatRequest({
        messages: [userMessage],
        trigger: 'regenerate-message',
        messageId: 'a1',
        body: { locale: 'en' },
      });

      expect(result).toEqual({
        body: { locale: 'en', regenerateFromMessageId: 'a1' },
      });
    });

    it('preserves all body fields', () => {
      const result = prepareChatRequest({
        messages: [],
        trigger: 'regenerate-message',
        messageId: 'a1',
        body: { locale: 'fr', extra: 'value' },
      });

      expect(result.body).toMatchObject({
        locale: 'fr',
        extra: 'value',
        regenerateFromMessageId: 'a1',
      });
    });
  });

  describe('submit-message trigger with messages', () => {
    it('sends the last message as delta', () => {
      const result = prepareChatRequest({
        messages: [userMessage],
        trigger: 'submit-message',
        messageId: undefined,
        body: { locale: 'en' },
      });

      expect(result).toEqual({ body: { locale: 'en', message: userMessage } });
    });

    it('preserves body fields alongside message', () => {
      const result = prepareChatRequest({
        messages: [userMessage],
        trigger: 'submit-message',
        messageId: undefined,
        body: { locale: 'fr' },
      });

      expect(result.body).toMatchObject({ locale: 'fr', message: userMessage });
    });
  });

  describe('submit-message trigger with empty messages', () => {
    it('sends no message — start signal', () => {
      const result = prepareChatRequest({
        messages: [],
        trigger: 'submit-message',
        messageId: undefined,
        body: { locale: 'en' },
      });

      expect(result).toEqual({ body: { locale: 'en' } });
      expect(result.body).not.toHaveProperty('message');
    });
  });

  it('handles undefined body', () => {
    const result = prepareChatRequest({
      messages: [],
      trigger: 'submit-message',
      messageId: undefined,
      body: undefined,
    });

    expect(result).toEqual({ body: {} });
  });
});
