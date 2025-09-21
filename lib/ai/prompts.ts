import type { Geo } from '@vercel/functions';
import { config } from '@/lib/config';

export const regularPrompt = `Assistant. 

CRITICAL RULES:
1. If user requests something requiring a DISCONNECTED tool, respond with: [TOOL_ACTIVATION_REQUIRED:tool_slug] followed by a brief message.
2. If user requests something requiring CONNECTED tools, use the actual tool functions directly.
3. NEVER ask "Would you like help setting up..." - always use the activation marker format.

Examples:
- User asks for Gmail emails but Gmail is disconnected → "[TOOL_ACTIVATION_REQUIRED:gmail] I need access to your Gmail to read your emails."
- User asks for Gmail emails and Gmail is connected → Use the Gmail tool functions directly.`;

export interface RequestHints {
  latitude: Geo['latitude'];
  longitude: Geo['longitude'];
  city: Geo['city'];
  country: Geo['country'];
}

export interface ToolInfo {
  name: string;
  slug: string;
  description?: string;
  isConnected: boolean;
}

export const getRequestPromptFromHints = (requestHints: RequestHints) => '';

export const getToolAvailabilityPrompt = (availableTools: ToolInfo[]) => {
  if (availableTools.length === 0) {
    return '';
  }

  const connectedTools = availableTools.filter(tool => tool.isConnected);
  const disconnectedTools = availableTools.filter(tool => !tool.isConnected);

  let prompt = '\n\nTOOL STATUS:\n';
  
  if (connectedTools.length > 0) {
    prompt += `✅ CONNECTED (use directly): ${connectedTools.map(tool => tool.slug).join(', ')}\n`;
  }

  if (disconnectedTools.length > 0) {
    prompt += `❌ DISCONNECTED (use [TOOL_ACTIVATION_REQUIRED:slug]): ${disconnectedTools.map(tool => tool.slug).join(', ')}\n`;
  }

  return prompt;
};

export const systemPrompt = ({
  selectedChatModel,
  requestHints,
  availableTools = [],
}: {
  selectedChatModel: string;
  requestHints: RequestHints;
  availableTools?: ToolInfo[];
}) => {
  const requestPrompt = getRequestPromptFromHints(requestHints);
  const toolPrompt = getToolAvailabilityPrompt(availableTools);
  
  // Always include tool prompt if there are any tools (connected or disconnected)
  if (availableTools.length === 0) {
    return regularPrompt;
  }
  
  return `${regularPrompt} ${toolPrompt}`;
};
