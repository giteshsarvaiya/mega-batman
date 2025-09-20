'use client';

import type { Attachment, UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, fetchWithErrorHandlers, generateUUID } from '@/lib/utils';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { toast } from './toast';
import type { Session } from 'next-auth';
import { useSearchParams } from 'next/navigation';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { useAutoResume } from '@/hooks/use-auto-resume';
import { ChatSDKError } from '@/lib/errors';
import { useToolbarState } from './toolbar';

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  session,
  autoResume,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: Session;
  autoResume: boolean;
}) {
  console.log('🛠️ Chat component rendered with id:', id);
  const { mutate } = useSWRConfig();

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const [enabledToolkits, setEnabledToolkits] = useState<Array<{ slug: string; isConnected: boolean }>>([]);
  const [toolkitsLoaded, setToolkitsLoaded] = useState(false);
  
  console.log('🛠️ Chat component state - enabledToolkits:', enabledToolkits, 'toolkitsLoaded:', toolkitsLoaded);

  // Manual test - if toolkits not loaded after 2 seconds, try to fetch manually
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!toolkitsLoaded) {
        console.log('🛠️ Manual fetch triggered - toolkits not loaded after 2 seconds');
        const manualFetch = async () => {
          try {
            const response = await fetch('/api/toolkits');
            if (response.ok) {
              const { toolkits } = await response.json();
              const connectedToolkits = toolkits
                .filter((toolkit: any) => toolkit.isConnected)
                .map((toolkit: any) => ({
                  slug: toolkit.slug,
                  isConnected: toolkit.isConnected,
                }));
              setEnabledToolkits(connectedToolkits);
              setToolkitsLoaded(true);
              console.log('🛠️ Manual fetch: Enabled toolkits loaded:', connectedToolkits);
            }
          } catch (error) {
            console.error('Manual fetch: Failed to fetch enabled toolkits:', error);
          }
        };
        manualFetch();
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [toolkitsLoaded]);

  // Fetch enabled toolkits immediately on mount
  useLayoutEffect(() => {
    console.log('🛠️ useLayoutEffect triggered - fetching enabled toolkits...');
    
    const fetchEnabledToolkits = async () => {
      try {
        console.log('🛠️ Fetching enabled toolkits on mount...');
        const response = await fetch('/api/toolkits');
        console.log('🛠️ Fetch response status:', response.status, response.ok);
        
        if (response.ok) {
          const { toolkits } = await response.json();
          console.log('🔍 Frontend received toolkits from /api/toolkits:', toolkits.map((t: any) => ({ slug: t.slug, name: t.name, isConnected: t.isConnected })));
          
          const connectedToolkits = toolkits
            .filter((toolkit: any) => toolkit.isConnected)
            .map((toolkit: any) => ({
              slug: toolkit.slug,
              isConnected: toolkit.isConnected,
            }));
          
          console.log('🛠️ Filtered connected toolkits:', connectedToolkits);
          setEnabledToolkits(connectedToolkits);
          setToolkitsLoaded(true);
          console.log('🛠️ Enabled toolkits loaded:', connectedToolkits);
          console.log('🛠️ Enabled toolkits count:', connectedToolkits.length);
        } else {
          console.error('Failed to fetch toolkits, response not ok:', response.status);
          setToolkitsLoaded(true);
        }
      } catch (error) {
        console.error('Failed to fetch enabled toolkits:', error);
        setToolkitsLoaded(true); // Still mark as loaded to prevent infinite waiting
      }
    };

    fetchEnabledToolkits();
  }, []);

  // Fallback useEffect in case useLayoutEffect doesn't work
  useEffect(() => {
    if (!toolkitsLoaded) {
      console.log('🛠️ Fallback useEffect triggered - toolkits not loaded yet');
      const fetchEnabledToolkits = async () => {
        try {
          console.log('🛠️ Fallback: Fetching enabled toolkits...');
          const response = await fetch('/api/toolkits');
          if (response.ok) {
            const { toolkits } = await response.json();
            const connectedToolkits = toolkits
              .filter((toolkit: any) => toolkit.isConnected)
              .map((toolkit: any) => ({
                slug: toolkit.slug,
                isConnected: toolkit.isConnected,
              }));
            setEnabledToolkits(connectedToolkits);
            setToolkitsLoaded(true);
            console.log('🛠️ Fallback: Enabled toolkits loaded:', connectedToolkits);
          }
        } catch (error) {
          console.error('Fallback: Failed to fetch enabled toolkits:', error);
          setToolkitsLoaded(true);
        }
      };
      fetchEnabledToolkits();
    }
  }, [toolkitsLoaded]);

  // Listen for tool connection events to refresh enabled toolkits
  useEffect(() => {
    const handleToolConnected = () => {
      console.log('🔄 Tool connected, refreshing enabled toolkits...');
      // Refresh the enabled toolkits when a tool is connected
      const refreshToolkits = async () => {
        try {
          const response = await fetch('/api/toolkits');
          if (response.ok) {
            const { toolkits } = await response.json();
            const connectedToolkits = toolkits
              .filter((toolkit: any) => toolkit.isConnected)
              .map((toolkit: any) => ({
                slug: toolkit.slug,
                isConnected: toolkit.isConnected,
              }));
            setEnabledToolkits(connectedToolkits);
            console.log('🛠️ Refreshed enabled toolkits:', connectedToolkits);
          }
        } catch (error) {
          console.error('Failed to refresh enabled toolkits:', error);
        }
      };
      refreshToolkits();
    };

    window.addEventListener('toolConnected', handleToolConnected);
    return () => window.removeEventListener('toolConnected', handleToolConnected);
  }, []);

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    status,
    stop,
    reload,
    experimental_resume,
    data,
  } = useChat({
    id,
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    fetch: fetchWithErrorHandlers,
    experimental_prepareRequestBody: (body) => {
      console.log('🛠️ Preparing request body with enabledToolkits:', enabledToolkits, 'toolkitsLoaded:', toolkitsLoaded);
      console.log('🛠️ Enabled toolkits details:', enabledToolkits.map(t => `${t.slug}:${t.isConnected}`));
      
      // If toolkits haven't loaded yet, log a warning but proceed
      if (!toolkitsLoaded) {
        console.warn('⚠️ Toolkits not loaded yet, proceeding with empty enabledToolkits');
      }
      
      const requestBody = {
        id,
        message: body.messages.at(-1),
        selectedChatModel: initialChatModel,
        selectedVisibilityType: visibilityType,
        enabledToolkits,
      };
      
      console.log('🛠️ Final request body enabledToolkits:', requestBody.enabledToolkits);
      return requestBody;
    },
    onFinish: () => {
      console.log('✅ Chat onFinish called');
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      console.error('❌ Chat error:', error);
      if (error instanceof ChatSDKError) {
        toast({
          type: 'error',
          description: error.message,
        });
      }
    },
  });

  const searchParams = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  // Log message changes
  useEffect(() => {
    console.log('📨 Messages updated:', {
      count: messages.length,
      lastMessage: messages[messages.length - 1]?.role,
      status
    });
  }, [messages, status]);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      console.log('🔍 Appending query:', query);
      append({
        role: 'user',
        content: query,
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, '', `/chat/${id}`);
    }
  }, [query, append, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  useAutoResume({
    autoResume,
    initialMessages,
    experimental_resume,
    data,
    setMessages,
  });

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedModelId={initialChatModel}
          selectedVisibilityType={initialVisibilityType}
          isReadonly={isReadonly}
          session={session}
        />

        <Messages
          chatId={id}
          status={status}
          votes={votes}
          messages={messages}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
        />

        <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
          {!isReadonly && (
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              handleSubmit={handleSubmit}
              status={status}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              setMessages={setMessages}
              append={append}
              selectedVisibilityType={visibilityType}
            />
          )}
        </form>
      </div>
    </>
  );
}
