import { NextResponse } from 'next/server';
import { checkDatabaseConnection } from '@/lib/db/queries';

export async function GET() {
  try {
    const isHealthy = await checkDatabaseConnection();
    
    if (isHealthy) {
      return NextResponse.json({ 
        status: 'healthy', 
        database: 'connected',
        timestamp: new Date().toISOString()
      });
    } else {
      return NextResponse.json({ 
        status: 'unhealthy', 
        database: 'disconnected',
        timestamp: new Date().toISOString()
      }, { status: 503 });
    }
  } catch (error) {
    console.error('❌ Database health check failed:', error);
    return NextResponse.json({ 
      status: 'error', 
      database: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
