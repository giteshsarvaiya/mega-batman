import type { Geo } from '@vercel/functions';
import { config } from '@/lib/config';

export const regularPrompt = 'Assistant. Use connected tools directly. Show [TOOL_ACTIVATION_REQUIRED:tool1,tool2] for disconnected tools.';

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

  let prompt = '';
  
  if (connectedTools.length > 0) {
    prompt += 'Connected: ' + connectedTools.map(tool => tool.slug).join(',');
  }

  if (disconnectedTools.length > 0) {
    prompt += ' Disconnected: ' + disconnectedTools.map(tool => tool.slug).join(',');
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
  
  // Only include tool prompt if there are connected tools
  if (availableTools.length === 0) {
    return regularPrompt;
  }
  
  return `${regularPrompt} ${toolPrompt}`;
};
