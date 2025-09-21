import {
  appendClientMessage,
  appendResponseMessages,
  createDataStream,
  smoothStream,
  streamText,
} from 'ai';
import { auth, type UserType } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt, type ToolInfo } from '@/lib/ai/prompts';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  getStreamIdsByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID, getTrailingMessageId } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
// import { after } from 'next/server';
import type { Chat } from '@/lib/db/schema';
import { differenceInSeconds } from 'date-fns';
import { ChatSDKError } from '@/lib/errors';
import { getComposioTools } from '@/lib/ai/tools/composio';
import { config } from '@/lib/config';

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil:  (promise: Promise<unknown>) => {
          // Fire-and-forget: run without blocking
          promise.catch(console.error);
        },
      });
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL',
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

export async function POST(request: Request) {
  console.log('🚀 Chat API POST request received');
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    console.log('📝 Request body parsed:', { 
      hasMessage: !!json.message, 
      hasId: !!json.id,
      selectedChatModel: json.selectedChatModel,
      enabledToolkitsCount: json.enabledToolkits?.length || 0
    });
    requestBody = postRequestBodySchema.parse(json);
  } catch (error) {
    console.error('❌ Failed to parse request body:', error);
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
      enabledToolkits,
    } = requestBody;

    console.log('👤 Checking authentication...');
    
    // Check critical environment variables
    const envCheck = {
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      POSTGRES_URL: !!process.env.POSTGRES_URL,
      AUTH_SECRET: !!process.env.AUTH_SECRET,
    };
    console.log('🔧 Environment variables check:', envCheck);
    
    const session = await auth();

    if (!session?.user) {
      console.error('❌ No session or user found');
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    console.log('✅ User authenticated:', { 
      userId: session.user.id, 
      userType: session.user.type,
      email: session.user.email 
    });

    const userType: UserType = session.user.type;

    console.log('📊 Checking rate limits...');
    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    console.log('📈 Message count:', { messageCount, maxAllowed: entitlementsByUserType[userType].maxMessagesPerDay });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      console.error('❌ Rate limit exceeded');
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    console.log('💬 Checking chat existence...');
    const chat = await getChatById({ id });

    if (!chat) {
      console.log('🆕 Creating new chat...');
      const title = await generateTitleFromUserMessage({
        message,
      });

      console.log('📝 Generated title:', title);
      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
      console.log('✅ New chat saved');
    } else {
      console.log('📖 Existing chat found:', { chatId: chat.id, userId: chat.userId });
      if (chat.userId !== session.user.id) {
        console.error('❌ Chat access forbidden');
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    console.log('📜 Fetching previous messages...');
    const previousMessages = await getMessagesByChatId({ id });
    console.log('📋 Previous messages count:', previousMessages.length);

    // Limit messages to prevent token limit exceeded error
    // Configurable via config file
    const limitedPreviousMessages = previousMessages.slice(-config.chat.maxMessages);
    console.log('📝 Limited previous messages count:', limitedPreviousMessages.length);
    
    // Additional safety: if we still have too many messages, reduce further
    const maxSafeMessages = Math.min(config.chat.maxMessages, 1);
    const finalMessages = limitedPreviousMessages.length > maxSafeMessages 
      ? limitedPreviousMessages.slice(-maxSafeMessages)
      : limitedPreviousMessages;
    console.log('📝 Final messages count (safety limit):', finalMessages.length);
    
    // Truncate message content to reduce tokens (aggressive truncation)
    const truncatedMessages = finalMessages.map(msg => ({
      ...msg,
      parts: Array.isArray(msg.parts) ? msg.parts.map((part: any) => {
        if (part.type === 'text' && part.text && part.text.length > 500) {
          return {
            ...part,
            text: part.text.substring(0, 500) + '... [truncated]'
          };
        }
        return part;
      }) : msg.parts
    }));
    console.log('📝 Messages truncated for token reduction');

    // Truncate current user message if too long (aggressive truncation)
    const truncatedUserMessage = {
      ...message,
      content: message.content && message.content.length > 1000 
        ? message.content.substring(0, 1000) + '... [truncated]'
        : message.content
    };
    
    const messages = appendClientMessage({
      // @ts-expect-error: todo add type conversion from DBMessage[] to UIMessage[]
      messages: truncatedMessages,
      message: truncatedUserMessage,
    });
    console.log('📝 Total messages for AI:', messages.length);

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    console.log('💾 Saving user message...');
    try {
      // Validate and format user message parts
      const formattedUserParts = message.parts?.map(part => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text || '' };
        }
        return part;
      }) || [];

      console.log('📝 User message parts:', {
        originalParts: message.parts?.length,
        formattedParts: formattedUserParts.length,
        firstPart: formattedUserParts[0],
      });

      // Check if message with this ID already exists
      const existingMessages = await getMessagesByChatId({ id });
      const messageExists = existingMessages.some(msg => msg.id === message.id);
      
      if (messageExists) {
        console.log('⚠️ Message with ID already exists, skipping save:', message.id);
      } else {
        await saveMessages({
          messages: [
            {
              chatId: id,
              id: message.id,
              role: 'user',
              parts: formattedUserParts,
              attachments: message.experimental_attachments ?? [],
              createdAt: new Date(),
            },
          ],
        });
        console.log('✅ User message saved');
      }
    } catch (error) {
      console.error('❌ Failed to save user message:', error);
      console.error('❌ User message error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        chatId: id,
        messageId: message.id,
        role: 'user',
        partsLength: message.parts?.length,
      });
      // Don't throw here, continue with the stream
    }

    const streamId = generateUUID();
    console.log('🆔 Generated stream ID:', streamId);
    await createStreamId({ streamId, chatId: id });
    console.log('✅ Stream ID created');

    console.log('🔄 Creating data stream...');
    const stream = createDataStream({
      execute: async (dataStream) => {
        console.log('🚀 Stream execution started');
        
        // Fetch toolkits data once for both Composio tools and system prompt
        console.log('🔧 Fetching toolkits data...');
        let availableTools: ToolInfo[] = [];
        let connectedToolkitSlugs: string[] = [];
        
        try {
          const toolkitsResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/toolkits`, {
            headers: {
              'Cookie': request.headers.get('cookie') || '',
            },
          });
          
          if (toolkitsResponse.ok) {
            const { toolkits } = await toolkitsResponse.json();
            console.log('🔍 Raw toolkits response from /api/toolkits:', toolkits.map((t: any) => ({ slug: t.slug, name: t.name, isConnected: t.isConnected })));
            
            // Prepare tools for system prompt (only connected tools, minimal info to reduce prompt size)
            availableTools = toolkits
              .filter((toolkit: any) => toolkit.isConnected)
              .map((toolkit: any) => ({
                name: toolkit.name,
                slug: toolkit.slug,
                description: undefined, // Remove descriptions to save tokens
                isConnected: toolkit.isConnected,
              }));
            
            // Get connected toolkit slugs for Composio tools
            connectedToolkitSlugs = toolkits
              .filter((toolkit: any) => toolkit.isConnected)
              .map((toolkit: any) => toolkit.slug);
            
            console.log('✅ Available tools fetched:', availableTools.length, 'tools');
            console.log('🔧 All tools:', availableTools.map(t => ({ slug: t.slug, name: t.name, isConnected: t.isConnected })));
            console.log('🔧 Connected tools:', availableTools.filter(t => t.isConnected).map(t => t.slug));
            console.log('🔧 Disconnected tools:', availableTools.filter(t => !t.isConnected).map(t => t.slug));
            console.log('🛠️ Connected toolkit slugs for Composio:', connectedToolkitSlugs);
          }
        } catch (error) {
          console.error('Failed to fetch toolkits:', error);
        }

        // Fetch Composio tools for connected toolkits only
        console.log('🔧 Fetching Composio tools for connected toolkits...');
        const composioTools = await getComposioTools(
          session.user.id,
          connectedToolkitSlugs,
        );
        console.log('✅ Composio tools fetched:', Object.keys(composioTools).length, 'tools');

        console.log('🤖 Starting AI stream with model:', selectedChatModel);
        console.log('📨 Messages being sent to AI:', messages.length);
        
        // Check if API key is available
        const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
        console.log('🔑 Anthropic API key available:', hasAnthropicKey);
        
        if (!hasAnthropicKey) {
          console.error('❌ ANTHROPIC_API_KEY is missing!');
          throw new Error('ANTHROPIC_API_KEY environment variable is required');
        }
        
        // For now, let's pass all available tools to see what the AI is actually seeing
        console.log('🤖 Using all available tools for system prompt:', availableTools.map(t => ({ slug: t.slug, isConnected: t.isConnected })));
        
        // Use minimal system prompt to reduce tokens
        const systemPromptText = config.chat.useMinimalPrompt 
          ? 'Assistant.'
          : availableTools.length > 0 
            ? systemPrompt({ selectedChatModel, requestHints, availableTools })
            : 'Assistant.';
        
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPromptText,
          messages,
          maxSteps: 5,
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            ...composioTools,
          },
          onFinish: async ({ response }) => {
            console.log('🏁 AI stream finished');
            if (session.user?.id) {
              const assistantId = getTrailingMessageId({
                messages: response.messages.filter(
                  (message) => message.role === 'assistant',
                ),
              });

              if (!assistantId) {
                console.error('❌ No assistant message found in response!');
                return;
              }

              const [, assistantMessage] = appendResponseMessages({
                messages: [message],
                responseMessages: response.messages,
              });

              try {
                console.log('💾 Saving assistant response...');
                console.log('🆔 Assistant message ID:', assistantId);

                // Validate and format message parts
                const formattedParts = assistantMessage.parts?.map(part => {
                  if (part.type === 'text') {
                    return { type: 'text', text: part.text || '' };
                  }
                  return part;
                }) || [];

                console.log('📝 Assistant message parts:', {
                  originalParts: assistantMessage.parts?.length,
                  formattedParts: formattedParts.length,
                  firstPart: formattedParts[0],
                });

                await saveMessages({
                  messages: [
                    {
                      id: assistantId,
                      chatId: id,
                      role: assistantMessage.role,
                      parts: formattedParts,
                      attachments:
                        assistantMessage.experimental_attachments ?? [],
                      createdAt: new Date(),
                    },
                  ],
                });
                console.log('✅ Assistant message saved to database');
              } catch (error) {
                console.error('❌ Failed to save assistant message:', error);
                console.error('❌ Error details:', {
                  message: error instanceof Error ? error.message : 'Unknown error',
                  stack: error instanceof Error ? error.stack : undefined,
                  assistantId,
                  chatId: id,
                  role: assistantMessage?.role,
                  partsLength: assistantMessage?.parts?.length,
                });
                // Continue execution - don't let database errors break the chat
                console.log('⚠️ Continuing despite database save failure');
              }
            } else {
              console.log('⚠️ No session user ID, skipping assistant message save');
            }
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        console.log('📡 Consuming stream...');
        result.consumeStream();

        console.log('🔄 Merging into data stream...');
        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
        console.log('✅ Stream merged successfully');
      },
      onError: (error) => {
        console.error('❌ Stream error occurred:', error);
        return 'Oops, an error occurred!';
      },
    });

    console.log('🌊 Getting stream context...');
    const streamContext = getStreamContext();

    if (streamContext) {
      console.log('✅ Using resumable stream');
      return new Response(
        await streamContext.resumableStream(streamId, () => stream),
      );
    } else {
      console.log('⚠️ Using regular stream (no Redis context)');
      return new Response(stream);
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    
    // Handle unexpected errors
    console.error('Unexpected error in chat API:', error);
    return new ChatSDKError('bad_request:api').toResponse();
  }
}

export async function GET(request: Request) {
  const streamContext = getStreamContext();
  const resumeRequestedAt = new Date();

  if (!streamContext) {
    return new Response(null, { status: 204 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  let chat: Chat;

  try {
    chat = await getChatById({ id: chatId });
  } catch {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (!chat) {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (chat.visibility === 'private' && chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const streamIds = await getStreamIdsByChatId({ chatId });

  if (!streamIds.length) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const recentStreamId = streamIds.at(-1);

  if (!recentStreamId) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const emptyDataStream = createDataStream({
    execute: () => {},
  });

  const stream = await streamContext.resumableStream(
    recentStreamId,
    () => emptyDataStream,
  );

  /*
   * For when the generation is streaming during SSR
   * but the resumable stream has concluded at this point.
   */
  if (!stream) {
    const messages = await getMessagesByChatId({ id: chatId });
    const mostRecentMessage = messages.at(-1);

    if (!mostRecentMessage) {
      return new Response(emptyDataStream, { status: 200 });
    }

    if (mostRecentMessage.role !== 'assistant') {
      return new Response(emptyDataStream, { status: 200 });
    }

    const messageCreatedAt = new Date(mostRecentMessage.createdAt);

    if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) > 15) {
      return new Response(emptyDataStream, { status: 200 });
    }

    const restoredStream = createDataStream({
      execute: (buffer) => {
        buffer.writeData({
          type: 'append-message',
          message: JSON.stringify(mostRecentMessage),
        });
      },
    });

    return new Response(restoredStream, { status: 200 });
  }

  return new Response(stream, { status: 200 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}