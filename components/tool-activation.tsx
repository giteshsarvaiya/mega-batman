'use client';

import React, { useState } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Loader2, Plug, ExternalLink, RotateCcw, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface RequiredTool {
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  isConnected: boolean;
  connectionId?: string;
}

interface ToolActivationProps {
  requiredTools: RequiredTool[];
  enabledTools?: Set<string>;
  onToolConnected?: (toolSlug: string) => void;
  onRetryQuery?: () => void;
  originalQuery?: string;
  onClose?: () => void;
}

// Map of toolkit slugs to their auth config environment variables
const TOOLKIT_AUTH_CONFIG: Record<string, string> = {
  GMAIL: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_GMAIL || '',
  GOOGLECALENDAR: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_GOOGLECALENDAR || '',
  GITHUB: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_GITHUB || '',
  NOTION: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_NOTION || '',
  SLACK: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_SLACK || '',
  LINEAR: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_LINEAR || '',
  GOOGLESHEETS: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_GOOGLESHEETS || '',
  CONFLUENCE: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_CONFLUENCE || '',
  OUTLOOK: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_OUTLOOK || '',
  MICROSOFT_TEAMS: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_MICROSOFT_TEAMS || '',
  JIRA: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_JIRA || '',
};

export function ToolActivation({ 
  requiredTools, 
  enabledTools: externalEnabledTools,
  onToolConnected, 
  onRetryQuery,
  originalQuery,
  onClose 
}: ToolActivationProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [connectingTools, setConnectingTools] = useState<Set<string>>(new Set());
  const [localEnabledTools, setLocalEnabledTools] = useState<Set<string>>(new Set());
  const [connectionStatus, setConnectionStatus] = useState<Map<string, 'idle' | 'connecting' | 'success' | 'error'>>(new Map());
  const [currentToolStatus, setCurrentToolStatus] = useState<Map<string, boolean>>(new Map());
  
  // Use external enabled tools if provided, otherwise use local state
  const enabledTools = externalEnabledTools || localEnabledTools;
  const setEnabledTools = externalEnabledTools ? () => {} : setLocalEnabledTools;

  // Fetch current tool connection status
  useEffect(() => {
    const fetchCurrentToolStatus = async () => {
      try {
        const response = await fetch('/api/toolkits');
        if (response.ok) {
          const { toolkits } = await response.json();
          const statusMap = new Map<string, boolean>();
          toolkits.forEach((toolkit: any) => {
            statusMap.set(toolkit.slug, toolkit.isConnected);
          });
          setCurrentToolStatus(statusMap);
        }
      } catch (error) {
        console.error('Failed to fetch current tool status:', error);
      }
    };

    fetchCurrentToolStatus();
  }, []);

  // Listen for tool connection events to refresh status
  useEffect(() => {
    const handleToolConnected = () => {
      // Refresh tool status when a tool is connected
      const fetchCurrentToolStatus = async () => {
        try {
          const response = await fetch('/api/toolkits');
          if (response.ok) {
            const { toolkits } = await response.json();
            const statusMap = new Map<string, boolean>();
            toolkits.forEach((toolkit: any) => {
              statusMap.set(toolkit.slug, toolkit.isConnected);
            });
            setCurrentToolStatus(statusMap);
          }
        } catch (error) {
          console.error('Failed to fetch current tool status:', error);
        }
      };
      fetchCurrentToolStatus();
    };

    window.addEventListener('toolConnected', handleToolConnected);
    return () => window.removeEventListener('toolConnected', handleToolConnected);
  }, []);

  const handleConnectTool = async (tool: RequiredTool) => {
    if (!session?.user?.id) {
      toast({
        title: 'Authentication required',
        description: 'Please sign in to connect tools.',
        variant: 'destructive',
      });
      return;
    }

    const authConfigId = TOOLKIT_AUTH_CONFIG[tool.slug.toUpperCase()];

    if (!authConfigId) {
      toast({
        title: 'Configuration error',
        description: `Auth configuration not found for ${tool.name}.`,
        variant: 'destructive',
      });
      return;
    }

    setConnectingTools(prev => new Set(prev).add(tool.slug));
    setConnectionStatus(prev => new Map(prev).set(tool.slug, 'connecting'));

    try {
      const response = await fetch('/api/connections/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ authConfigId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const { redirectUrl, connectionId } = data;

      if (redirectUrl && connectionId) {
        // Open OAuth window
        window.open(redirectUrl, '_blank');

        // Set success status temporarily
        setConnectionStatus(prev => new Map(prev).set(tool.slug, 'success'));

        toast({
          title: 'Connection initiated successfully!',
          description: `Please complete the authorization in the opened window for ${tool.name}. Once done, the tool will be available.`,
        });

                // Notify parent component
                onToolConnected?.(tool.slug);
                
                // Also trigger a global event to refresh toolbar
                window.dispatchEvent(new CustomEvent('toolConnected', { 
                  detail: { toolSlug: tool.slug } 
                }));

        // Reset status after a delay
        setTimeout(() => {
          setConnectionStatus(prev => new Map(prev).set(tool.slug, 'idle'));
        }, 3000);
      } else {
        setConnectionStatus(prev => new Map(prev).set(tool.slug, 'error'));
        toast({
          title: 'Connection failed',
          description: 'No authorization URL received. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to connect tool:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setConnectionStatus(prev => new Map(prev).set(tool.slug, 'error'));
      toast({
        title: 'Connection failed',
        description: `Failed to connect ${tool.name}: ${errorMessage}`,
        variant: 'destructive',
      });
    } finally {
      setConnectingTools(prev => {
        const newSet = new Set(prev);
        newSet.delete(tool.slug);
        return newSet;
      });
    }
  };


  const checkToolsReady = () => {
    return requiredTools.every(tool => {
      // Use current tool status if available, otherwise fall back to original status
      const currentStatus = currentToolStatus.get(tool.slug);
      return currentStatus !== undefined ? currentStatus : tool.isConnected;
    });
  };

  // Filter to only show disconnected tools that need connection
  // Use current tool status if available, otherwise fall back to original status
  const disconnectedTools = requiredTools.filter(tool => {
    const currentStatus = currentToolStatus.get(tool.slug);
    return currentStatus !== undefined ? !currentStatus : !tool.isConnected;
  });
  
  if (disconnectedTools.length === 0) {
    return null;
  }

  const allToolsReady = requiredTools.every(tool => 
    tool.isConnected
  );

  return (
    <div className="mt-3 p-3 bg-muted/30 border border-border rounded-lg">
      <div className="flex items-center gap-2 mb-3">
        <Plug className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">
          Tools that need to be connected
        </span>
      </div>
      
      <div className="space-y-2">
        {disconnectedTools.map((tool) => (
          <div 
            key={tool.slug}
            className="flex items-center justify-between p-2 bg-background border border-border rounded-md"
          >
            <div className="flex items-center gap-2">
              {tool.logo && (
                <Image 
                  src={tool.logo} 
                  alt={tool.name} 
                  width={16}
                  height={16}
                  className="rounded-sm"
                />
              )}
              <span className="text-sm font-medium">{tool.name}</span>
              <Badge 
                variant={(() => {
                  const currentStatus = currentToolStatus.get(tool.slug);
                  const isConnected = currentStatus !== undefined ? currentStatus : tool.isConnected;
                  return isConnected ? "default" : "secondary";
                })()}
                className={cn(
                  "text-xs",
                  (() => {
                    const currentStatus = currentToolStatus.get(tool.slug);
                    const isConnected = currentStatus !== undefined ? currentStatus : tool.isConnected;
                    if (isConnected) return "bg-green-100 text-green-800 hover:bg-green-100";
                    if (connectionStatus.get(tool.slug) === 'connecting') return "bg-blue-100 text-blue-800 hover:bg-blue-100";
                    if (connectionStatus.get(tool.slug) === 'success') return "bg-green-100 text-green-800 hover:bg-green-100";
                    if (connectionStatus.get(tool.slug) === 'error') return "bg-red-100 text-red-800 hover:bg-red-100";
                    return "bg-orange-100 text-orange-800 hover:bg-orange-100";
                  })()
                )}
              >
                {(() => {
                  const currentStatus = currentToolStatus.get(tool.slug);
                  const isConnected = currentStatus !== undefined ? currentStatus : tool.isConnected;
                  if (isConnected) return "Connected";
                  if (connectionStatus.get(tool.slug) === 'connecting') return "Connecting...";
                  if (connectionStatus.get(tool.slug) === 'success') return "Authorization Started";
                  if (connectionStatus.get(tool.slug) === 'error') return "Connection Failed";
                  return "Not Connected";
                })()}
              </Badge>
            </div>
            
            <div className="flex items-center gap-1">
              {/* Connect Button - only show when not connected */}
              {(() => {
                const currentStatus = currentToolStatus.get(tool.slug);
                const isConnected = currentStatus !== undefined ? currentStatus : tool.isConnected;
                return !isConnected;
              })() && (
                <Button
                  onClick={() => handleConnectTool(tool)}
                  disabled={connectingTools.has(tool.slug) || connectionStatus.get(tool.slug) === 'success'}
                  size="sm"
                  variant={connectionStatus.get(tool.slug) === 'error' ? "destructive" : "outline"}
                  className={cn(
                    "h-7 px-3 text-xs",
                    connectionStatus.get(tool.slug) === 'success' && "bg-green-100 text-green-800 border-green-300"
                  )}
                >
                  {connectingTools.has(tool.slug) ? (
                    <>
                      <Loader2 className="size-3 mr-1 animate-spin" />
                      Connecting...
                    </>
                  ) : connectionStatus.get(tool.slug) === 'success' ? (
                    <>
                      <Check className="size-3 mr-1" />
                      Authorization Started
                    </>
                  ) : connectionStatus.get(tool.slug) === 'error' ? (
                    <>
                      <ExternalLink className="size-3 mr-1" />
                      Try Again
                    </>
                  ) : (
                    <>
                      <ExternalLink className="size-3 mr-1" />
                      Connect {tool.name}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

              {/* Follow-up suggestion - only show when all tools are ready */}
              {originalQuery && onRetryQuery && checkToolsReady() && (
                <div className="mt-4 p-3 bg-muted/20 border border-border rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="size-6 flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                      💡
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground mb-1">
                        Ready to try your request again?
                      </div>
                      <div className="text-xs text-muted-foreground mb-3">
                        All tools are connected and ready to use.
                      </div>
                      <Button
                        onClick={onRetryQuery}
                        size="sm"
                        variant="default"
                        className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <RotateCcw className="size-3 mr-2" />
                        Retry Request
                      </Button>
                    </div>
                  </div>
                </div>
              )}

    </div>
  );
}
