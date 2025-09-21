import { auth } from '@/app/(auth)/auth';
import type { NextRequest } from 'next/server';
import { getChatsByUserId } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const limit = Number.parseInt(searchParams.get('limit') || '10');
    const startingAfter = searchParams.get('starting_after');
    const endingBefore = searchParams.get('ending_before');

    console.log('📋 History API request:', { limit, startingAfter, endingBefore });

    if (startingAfter && endingBefore) {
      return new ChatSDKError(
        'bad_request:api',
        'Only one of starting_after or ending_before can be provided.',
      ).toResponse();
    }

    const session = await auth();

    if (!session?.user) {
      console.log('❌ No session found');
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    console.log('👤 User session:', { userId: session.user.id, email: session.user.email });

    const chats = await getChatsByUserId({
      id: session.user.id,
      limit,
      startingAfter,
      endingBefore,
    });

    console.log('✅ Chats retrieved:', { count: chats.chats.length, hasMore: chats.hasMore });
    return Response.json(chats);
  } catch (error) {
    console.error('❌ History API error:', error);
    return new ChatSDKError('bad_request:api', 'Failed to get chat history').toResponse();
  }
}
