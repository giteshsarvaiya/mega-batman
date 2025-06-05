import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import composio from '@/lib/services/composio';
import { ChatSDKError } from '@/lib/errors';

// Using custom types since they're not exported from @composio/core
type ToolkitResponse = {
  name: string;
  slug: string;
  meta?: {
    description?: string;
    logo?: string;
    categories?: Array<{
      name: string;
      slug: string;
    }>;
  };
};

type ConnectedAccount = {
  id: string;
  toolkit: {
    slug: string;
  };
};

// Hardcoded list of supported toolkits
const SUPPORTED_TOOLKITS = [
  'GMAIL',
  'GOOGLECALENDAR',
  'GITHUB',
  'NOTION',
  'SLACK',
  'LINEAR',
];

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  try {
    // Fetch connected accounts for the user
    const connectedToolkitSlugs: Set<string> = new Set();

    try {
      const connectedAccounts = await composio.connectedAccounts.list({
        userIds: [session.user.id],
      });

      // Extract toolkit slugs from connected accounts
      connectedAccounts.items.forEach((account: ConnectedAccount) => {
        if (account.toolkit?.slug) {
          connectedToolkitSlugs.add(account.toolkit.slug.toUpperCase());
        }
      });
    } catch (error) {
      console.error('Failed to fetch connected accounts:', error);
      // Continue without connection status if this fails
    }

    // Fetch all toolkits in parallel
    const toolkitPromises = SUPPORTED_TOOLKITS.map(async (slug) => {
      try {
        const toolkit = (await composio.toolkits.get(slug)) as ToolkitResponse;
        return {
          name: toolkit.name,
          slug: toolkit.slug,
          description: toolkit.meta?.description,
          logo: toolkit.meta?.logo,
          categories: toolkit.meta?.categories,
          isConnected: connectedToolkitSlugs.has(slug.toUpperCase()),
        };
      } catch (error) {
        console.error(`Failed to fetch toolkit ${slug}:`, error);
        return null;
      }
    });

    const results = await Promise.all(toolkitPromises);
    const toolkits = results.filter((t) => t !== null);

    return NextResponse.json({ toolkits });
  } catch (error) {
    console.error('Failed to fetch toolkits:', error);
    return NextResponse.json(
      { error: 'Failed to fetch toolkits' },
      { status: 500 },
    );
  }
}
