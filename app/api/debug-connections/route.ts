import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import composio from '@/lib/services/composio';
import { ChatSDKError } from '@/lib/errors';

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  try {
    // Fetch connected accounts directly from Composio
    const connectedAccounts = await composio.connectedAccounts.list({
      userIds: [session.user.id],
    });

    // Also fetch toolkits to see what's available
    const gmailToolkit = await composio.toolkits.get('GMAIL');

    return NextResponse.json({
      userId: session.user.id,
      connectedAccounts: {
        total: connectedAccounts.items?.length || 0,
        items: connectedAccounts.items?.map((acc: any) => ({
          id: acc.id,
          toolkitSlug: acc.toolkit?.slug,
          toolkitSlugUpper: acc.toolkit?.slug?.toUpperCase(),
          status: acc.status,
          createdAt: acc.createdAt,
        })) || []
      },
      gmailToolkit: {
        slug: gmailToolkit.slug,
        name: gmailToolkit.name,
        description: gmailToolkit.meta?.description,
      }
    });
  } catch (error) {
    console.error('Debug connections error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to debug connections',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
