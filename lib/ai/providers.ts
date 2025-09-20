import { customProvider } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

// For now, always use production provider to avoid test dependency issues
export const myProvider = customProvider({
  languageModels: {
    // 'chat-model': anthropic('claude-4-sonnet-20250514'),
    'chat-model': anthropic('claude-3-5-haiku-latest'),
    'title-model': anthropic('claude-3-5-haiku-latest'),
  },
});
