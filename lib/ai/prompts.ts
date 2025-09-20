import type { Geo } from '@vercel/functions';

export const regularPrompt =
  'You are a friendly assistant! Keep your responses concise and helpful.\n\n🚨 CRITICAL TOOL USAGE RULES - FOLLOW THESE EXACTLY:\n1. When user requests something that requires tools, check tool connection status\n2. IF ALL required tools are CONNECTED: Use the actual tool functions immediately and provide the answer - ABSOLUTELY NO tool activation UI\n3. IF ANY required tools are DISCONNECTED: Provide helpful response AND show tool activation UI for disconnected tools only\n4. NEVER show tool activation UI if ALL required tools are connected\n5. NEVER ask for permission to use connected tools - use them directly\n6. If you see connected tools in the tool list, USE THE ACTUAL TOOL FUNCTIONS - do not show activation UI\n7. DO NOT say you cannot access tools if they are connected - USE THEM!\n8. When ANY required tool is missing: Give response + show activation UI for missing tools\n9. Use format: [TOOL_ACTIVATION_REQUIRED:tool1,tool2] for disconnected tools only\n10. NEVER say "I cannot retrieve" or "I do not have access" if tools are connected - USE THE TOOL FUNCTIONS!\n11. Check available tool functions and use the appropriate ones for the user\'s request';

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

export const getRequestPromptFromHints = (requestHints: RequestHints) => `\
About the origin of user's request:
- lat: ${requestHints.latitude}
- lon: ${requestHints.longitude}
- city: ${requestHints.city}
- country: ${requestHints.country}
`;

export const getToolAvailabilityPrompt = (availableTools: ToolInfo[]) => {
  if (availableTools.length === 0) {
    return '\n\nNo tools are currently enabled. To use tools like Gmail, Calendar, etc., the user needs to:\n1. Enable the tool in the toolbar (toggle it ON)\n2. Connect the tool if not already connected\n3. Then make their request again';
  }

  const connectedTools = availableTools.filter(tool => tool.isConnected);
  const disconnectedTools = availableTools.filter(tool => !tool.isConnected);

  let prompt = '\n\n🔧 TOOL STATUS:\n';
  
  if (connectedTools.length > 0) {
    prompt += '✅ CONNECTED TOOLS (USE THESE IMMEDIATELY):\n';
    connectedTools.forEach(tool => {
      prompt += `- ${tool.name} (${tool.slug}): ${tool.description || 'No description available'}\n`;
    });
  }

  if (disconnectedTools.length > 0) {
    prompt += '\n❌ DISCONNECTED TOOLS (need connection):\n';
    disconnectedTools.forEach(tool => {
      prompt += `- ${tool.name} (${tool.slug}): ${tool.description || 'No description available'}\n`;
    });
  }

  prompt += '\n🚨 CRITICAL RULES - NO EXCEPTIONS:\n';
  prompt += '1. If user requests something that needs ONLY CONNECTED tools → USE THE ACTUAL TOOL FUNCTIONS DIRECTLY\n';
  prompt += '2. If user requests something that needs ANY DISCONNECTED tools → Provide response AND show activation UI for disconnected tools\n';
  prompt += '3. NEVER show activation UI if ALL required tools are connected\n';
  prompt += '4. NEVER ask permission to use connected tools\n';
  prompt += '5. If you see connected tools in the list above, USE THE ACTUAL TOOL FUNCTIONS IMMEDIATELY\n';
  prompt += '6. DO NOT say you cannot access tools if they are connected - USE THE TOOL FUNCTIONS!\n';
  prompt += '7. The tool functions are available to you - call them directly when tools are connected\n';
  prompt += '8. When ANY required tool is missing: Provide helpful response + show activation UI for missing tools\n';
  prompt += '9. Use format: [TOOL_ACTIVATION_REQUIRED:tool1,tool2] for disconnected tools only\n';
  prompt += '10. NEVER say "I cannot retrieve" or "I do not have access" if tools are connected - USE THEM!\n';
  prompt += '11. Check the available tool functions and use the appropriate ones for the user\'s request\n';

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
  return `${regularPrompt}\n\n${requestPrompt}${toolPrompt}`;
};
