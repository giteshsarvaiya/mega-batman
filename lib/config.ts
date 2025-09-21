/**
 * Application configuration
 */

export const config = {
  // Chat configuration
  chat: {
    // Maximum number of previous messages to include in context
    maxMessages: parseInt(process.env.MAX_CHAT_MESSAGES || '1', 10),
    
    // Maximum tokens for AI requests (safety limit)
    maxTokens: parseInt(process.env.MAX_AI_TOKENS || '180000', 10),
    
    // Whether to include tool descriptions in prompts
    includeToolDescriptions: process.env.INCLUDE_TOOL_DESCRIPTIONS === 'true',
    
    // Whether to use minimal system prompt (for token reduction)
    useMinimalPrompt: process.env.USE_MINIMAL_PROMPT === 'true',
  },
  
  // Tool configuration
  tools: {
    // Whether to show detailed tool status
    showDetailedStatus: process.env.SHOW_DETAILED_TOOL_STATUS === 'true',
  },
} as const;

export type Config = typeof config;
