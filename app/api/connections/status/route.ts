import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import composio from '@/lib/services/composio';
import { ChatSDKError } from '@/lib/errors';

// Type for the connection status response
type ConnectionStatus = {
  id: string;
  status: 'INITIALIZING' | 'INITIATED' | 'ACTIVE' | 'FAILED' | 'EXPIRED';
  authConfig: {
    id: string;
    isComposioManaged: boolean;
    isDisabled: boolean;
  };
  data: Record<string, unknown>;
  params?: Record<string, unknown>;
};

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get('connectionId');

  if (!connectionId) {
    return new ChatSDKError(
      'bad_request:api',
      'Connection ID is required',
    ).toResponse();
  }

  try {
    console.log(`🔍 Checking connection status for ID: ${connectionId}`);
    
    // First try to get the connection directly without waiting
    try {
      const connection = await composio.connectedAccounts.get(connectionId);
      console.log(`📊 Connection status for ${connectionId}:`, connection.status);
      
      return NextResponse.json({
        id: connection.id,
        status: connection.status,
        authConfig: connection.authConfig,
        data: connection.data,
        params: connection.params,
      });
    } catch (directError) {
      console.log(`⚠️ Direct connection check failed, trying waitForConnection:`, directError);
      
      // If direct check fails, try waitForConnection with timeout
      const connection = (await composio.connectedAccounts.waitForConnection(
        connectionId,
        // Optional: Add timeout configuration if supported
      )) as ConnectionStatus;

      console.log(`📊 WaitForConnection result for ${connectionId}:`, connection.status);

      return NextResponse.json({
        id: connection.id,
        status: connection.status,
        authConfig: connection.authConfig,
        data: connection.data,
        params: connection.params,
      });
    }
  } catch (error) {
    console.error('Failed to get connection status:', error);

    if (error instanceof Error && 'code' in error) {
      // Handle Composio specific errors
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to get connection status' },
      { status: 500 },
    );
  }
}
