import { customProvider } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { isTestEnvironment } from '../constants';
import { chatModel, titleModel } from './models.test';

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'title-model': titleModel,
      },
    })
  : customProvider({
      languageModels: {
        // 'chat-model': anthropic('claude-4-sonnet-20250514'),
        'chat-model': anthropic('claude-3-5-haiku-latest'),
        'title-model': anthropic('claude-3-5-haiku-latest'),
      },
    });
