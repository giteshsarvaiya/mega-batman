export interface RequiredTool {
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  isConnected: boolean;
  connectionId?: string;
}

export interface ToolActivationData {
  requiredTools: RequiredTool[];
  message: string;
}

/**
 * Parses a message to detect tool activation requirements
 * Looks for the format: [TOOL_ACTIVATION_REQUIRED:tool1,tool2] in the message
 */
export function parseToolActivationMessage(
  message: string,
  availableTools: RequiredTool[]
): ToolActivationData | null {
  const toolActivationRegex = /\[TOOL_ACTIVATION_REQUIRED:([^\]]+)\]/g;
  const matches = Array.from(message.matchAll(toolActivationRegex));
  
  if (matches.length === 0) {
    return null;
  }

  // Extract all required tool slugs
  const requiredSlugs = new Set<string>();
  matches.forEach(match => {
    const slugs = match[1].split(',').map(slug => slug.trim());
    slugs.forEach(slug => requiredSlugs.add(slug));
  });

  // Find the corresponding tool information
  const requiredTools = Array.from(requiredSlugs)
    .map(slug => availableTools.find(tool => tool.slug === slug))
    .filter((tool): tool is RequiredTool => tool !== undefined);

  if (requiredTools.length === 0) {
    return null;
  }

  // Remove the tool activation markers from the message
  const cleanMessage = message.replace(toolActivationRegex, '').trim();

  return {
    requiredTools,
    message: cleanMessage,
  };
}

/**
 * Checks if a message contains tool activation requirements
 */
export function hasToolActivationRequirements(message: string): boolean {
  return /\[TOOL_ACTIVATION_REQUIRED:[^\]]+\]/.test(message);
}
