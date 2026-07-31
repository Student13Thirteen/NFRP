import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        ok: true,
        database: 'ok',
        responseMs: Date.now() - startedAt
      },
      {
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  } catch (error) {
    console.error('Health check failed.', error);

    return NextResponse.json(
      {
        ok: false,
        database: 'error',
        responseMs: Date.now() - startedAt
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  }
}
