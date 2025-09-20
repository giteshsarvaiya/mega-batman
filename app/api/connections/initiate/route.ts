import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import composio from '@/lib/services/composio';
import { initiateConnectionSchema } from './schema';
import { ChatSDKError } from '@/lib/errors';
// ConnectionRequest type is not exported from @composio/core
type ConnectionRequestResponse = {
  id: string;
  redirectUrl?: string | null;
};

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  let requestBody: { authConfigId: string };

  try {
    const json = await request.json();
    requestBody = initiateConnectionSchema.parse(json);
  } catch (_) {
    return new ChatSDKError(
      'bad_request:api',
      'Invalid request body',
    ).toResponse();
  }

  try {
    const { authConfigId } = requestBody;

    // Check if Composio API key is configured
    if (!process.env.COMPOSIO_API_KEY) {
      console.error('COMPOSIO_API_KEY environment variable is not set');
      return NextResponse.json(
        { error: 'Composio API key not configured' },
        { status: 500 },
      );
    }

    console.log('Initiating connection with:', {
      userId: session.user.id,
      authConfigId,
    });

    // Initiate connection with Composio
    const connectionRequest = (await composio.connectedAccounts.initiate(
      session.user.id,
      authConfigId,
      // {
      //   callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/callback`,
      // },
    )) as ConnectionRequestResponse;

    console.log('Connection request successful:', {
      id: connectionRequest.id,
      hasRedirectUrl: !!connectionRequest.redirectUrl,
    });

    return NextResponse.json({
      redirectUrl: connectionRequest.redirectUrl,
      connectionId: connectionRequest.id,
    });
  } catch (error) {
    console.error('Failed to initiate connection:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });

    if (error instanceof Error && 'code' in error) {
      // Handle Composio specific errors
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { 
        error: 'Failed to initiate connection',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 },
    );
  }
}
