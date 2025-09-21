import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  like,
  lt,
  type SQL,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  user,
  chat,
  message,
  vote,
  type DBMessage,
  type Chat,
  stream,
} from './schema';
import type { VisibilityType } from '@/components/visibility-selector';
import { ChatSDKError } from '../errors';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!, {
  // Connection pool configuration
  max: 20, // Maximum number of connections
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout in seconds
  // Connection health checks
  prepare: false, // Disable prepared statements for better compatibility
  // Error handling
  onnotice: () => {}, // Suppress notices
});

const db = drizzle(client);

// Database health check function
export async function checkDatabaseConnection() {
  try {
    await client`SELECT 1`;
    return true;
  } catch (error) {
    console.error('❌ Database connection check failed:', error);
    return false;
  }
}

// Retry wrapper for database operations
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Check if it's a connection-related error
      const isConnectionError = 
        error instanceof Error && (
          error.message.includes('ECONNRESET') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('timeout') ||
          error.message.includes('connection')
        );
      
      if (isConnectionError && attempt < maxRetries) {
        console.warn(`⚠️ Database connection error in ${operationName} (attempt ${attempt}/${maxRetries}):`, error);
        console.log(`🔄 Retrying in ${attempt * 1000}ms...`);
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        continue;
      }
      
      // If not a connection error or max retries reached, throw immediately
      throw error;
    }
  }
  
  throw lastError;
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;

  try {
    return await db
      .insert(user)
      .values({
        email,
        password: null,
        githubId: null,
        avatarUrl: null,
      })
      .returning({
        id: user.id,
        email: user.email,
      });
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create guest user',
    );
  }
}

export async function createOrUpdateGitHubUser({
  email,
  githubId,
  githubUsername,
  avatarUrl,
}: {
  email?: string | null;
  githubId: string;
  githubUsername: string;
  avatarUrl: string;
}) {
  try {
    // First try to find existing user by GitHub ID
    const existingUser = await db
      .select()
      .from(user)
      .where(eq(user.githubId, githubId));

    if (existingUser.length > 0) {
      // Update existing user
      return await db
        .update(user)
        .set({ email, githubUsername, avatarUrl })
        .where(eq(user.githubId, githubId))
        .returning({
          id: user.id,
          email: user.email,
          githubId: user.githubId,
          githubUsername: user.githubUsername,
          avatarUrl: user.avatarUrl,
        });
    } else {
      // Create new user - use GitHub username as email fallback
      const fallbackEmail = email || `${githubUsername}@github.local`;
      return await db
        .insert(user)
        .values({
          email: fallbackEmail,
          password: null,
          githubId,
          githubUsername,
          avatarUrl,
        })
        .returning({
          id: user.id,
          email: user.email,
          githubId: user.githubId,
          githubUsername: user.githubUsername,
          avatarUrl: user.avatarUrl,
        });
    }
  } catch (error) {
    console.error('Database error in createOrUpdateGitHubUser:', error);
    throw new ChatSDKError(
      'bad_request:database',
      `Failed to create or update GitHub user: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

export async function createOrUpdateGoogleUser({
  email,
  googleId,
  googleUsername,
  avatarUrl,
}: {
  email?: string | null;
  googleId: string;
  googleUsername: string;
  avatarUrl: string;
}) {
  try {
    // First try to find existing user by Google ID
    const existingUser = await db
      .select()
      .from(user)
      .where(eq(user.googleId, googleId));

    if (existingUser.length > 0) {
      // Update existing user
      return await db
        .update(user)
        .set({ email, googleUsername, avatarUrl })
        .where(eq(user.googleId, googleId))
        .returning({
          id: user.id,
          email: user.email,
          googleId: user.googleId,
          googleUsername: user.googleUsername,
          avatarUrl: user.avatarUrl,
        });
    } else {
      // Create new user - use Google username as email fallback
      const fallbackEmail = email || `${googleUsername}@google.local`;
      return await db
        .insert(user)
        .values({
          email: fallbackEmail,
          password: null,
          googleId,
          googleUsername,
          avatarUrl,
        })
        .returning({
          id: user.id,
          email: user.email,
          googleId: user.googleId,
          googleUsername: user.googleUsername,
          avatarUrl: user.avatarUrl,
        });
    }
  } catch (error) {
    console.error('Database error in createOrUpdateGoogleUser:', error);
    throw new ChatSDKError(
      'bad_request:database',
      `Failed to create or update Google user: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

export async function upgradeGuestToGitHubUser({
  guestUserId,
  githubData,
}: {
  guestUserId: string;
  githubData: {
    email?: string | null;
    githubId: string;
    githubUsername: string;
    avatarUrl: string;
  };
}) {
  try {
    // Check for conflicts with existing GitHub users
    const existingGitHubUser = await db
      .select()
      .from(user)
      .where(eq(user.githubId, githubData.githubId));

    if (existingGitHubUser.length > 0) {
      throw new ChatSDKError(
        'bad_request:database',
        'A user with this GitHub account already exists',
      );
    }

    // Verify the guest user exists and is actually a guest
    const [guestUser] = await db
      .select()
      .from(user)
      .where(
        and(
          eq(user.id, guestUserId),
          isNull(user.githubId), // Ensure it's actually a guest
          like(user.email, 'guest-%'), // Additional safety check
        ),
      );

    if (!guestUser) {
      throw new ChatSDKError(
        'not_found:database',
        'Guest user not found or already upgraded',
      );
    }

    // Update the guest user with GitHub data (preserving the UUID)
    const [upgradedUser] = await db
      .update(user)
      .set({
        email: githubData.email || guestUser.email, // Keep guest email as fallback
        githubId: githubData.githubId,
        githubUsername: githubData.githubUsername,
        avatarUrl: githubData.avatarUrl,
      })
      .where(eq(user.id, guestUserId))
      .returning({
        id: user.id,
        email: user.email,
        githubId: user.githubId,
        githubUsername: user.githubUsername,
        avatarUrl: user.avatarUrl,
      });

    console.log(
      `Successfully upgraded guest user ${guestUserId} to GitHub user ${githubData.githubUsername}`,
    );

    return upgradedUser;
  } catch (error) {
    console.error('Failed to upgrade guest user:', error);
    throw error;
  }
}

export async function upgradeGuestToGoogleUser({
  guestUserId,
  googleData,
}: {
  guestUserId: string;
  googleData: {
    email?: string | null;
    googleId: string;
    googleUsername: string;
    avatarUrl: string;
  };
}) {
  try {
    // Check for conflicts with existing Google users
    const existingGoogleUser = await db
      .select()
      .from(user)
      .where(eq(user.googleId, googleData.googleId));

    if (existingGoogleUser.length > 0) {
      throw new ChatSDKError(
        'bad_request:database',
        'A user with this Google account already exists',
      );
    }

    // Verify the guest user exists and is actually a guest
    const [guestUser] = await db
      .select()
      .from(user)
      .where(
        and(
          eq(user.id, guestUserId),
          isNull(user.googleId), // Ensure it's actually a guest
          like(user.email, 'guest-%'), // Additional safety check
        ),
      );

    if (!guestUser) {
      throw new ChatSDKError(
        'not_found:database',
        'Guest user not found or already upgraded',
      );
    }

    // Update the guest user with Google data (preserving the UUID)
    const [upgradedUser] = await db
      .update(user)
      .set({
        email: googleData.email || guestUser.email, // Keep guest email as fallback
        googleId: googleData.googleId,
        googleUsername: googleData.googleUsername,
        avatarUrl: googleData.avatarUrl,
      })
      .where(eq(user.id, guestUserId))
      .returning({
        id: user.id,
        email: user.email,
        googleId: user.googleId,
        googleUsername: user.googleUsername,
        avatarUrl: user.avatarUrl,
      });

    console.log(
      `Successfully upgraded guest user ${guestUserId} to Google user ${googleData.googleUsername}`,
    );

    return upgradedUser;
  } catch (error) {
    console.error('Failed to upgrade guest user:', error);
    throw error;
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save chat');
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete chat by id',
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  return withRetry(async () => {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id),
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Array<Chat> = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${startingAfter} not found`,
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${endingBefore} not found`,
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  }, 'getChatsByUserId').catch((error) => {
    console.error('❌ Database error in getChatsByUserId:', error);
    console.error('❌ Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      userId: id,
      limit,
      startingAfter,
      endingBefore,
    });
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get chats by user id',
    );
  });
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get chat by id');
  }
}

export async function saveMessages({
  messages,
}: {
  messages: Array<DBMessage>;
}) {
  try {
    console.log('💾 Attempting to save messages:', {
      count: messages.length,
      firstMessage: messages[0] ? {
        id: messages[0].id,
        chatId: messages[0].chatId,
        role: messages[0].role,
        partsLength: Array.isArray(messages[0].parts) ? messages[0].parts.length : 0,
        attachmentsLength: Array.isArray(messages[0].attachments) ? messages[0].attachments.length : 0,
      } : null
    });
    
    const result = await db.insert(message).values(messages);
    console.log('✅ Messages saved successfully');
    return result;
  } catch (error) {
    console.error('❌ Database save error:', error);
    console.error('❌ Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      code: (error as any)?.code,
      constraint: (error as any)?.constraint,
      detail: (error as any)?.detail,
      messages: messages.map(m => ({
        id: m.id,
        chatId: m.chatId,
        role: m.role,
        partsLength: Array.isArray(m.parts) ? m.parts.length : 0,
      }))
    });
    throw new ChatSDKError('bad_request:database', 'Failed to save messages');
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get messages by chat id',
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to vote message');
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get votes by chat id',
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get message by id',
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete messages by chat id after timestamp',
    );
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to update chat visibility by id',
    );
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: { id: string; differenceInHours: number }) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000,
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, 'user'),
        ),
      )
      .execute();

    return stats?.count ?? 0;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get message count by user id',
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create stream id',
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get stream ids by chat id',
    );
  }
}
