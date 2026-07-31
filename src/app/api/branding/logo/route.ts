import { readBrandLogo } from '@/lib/branding';

export const dynamic = 'force-dynamic';

export async function GET() {
  const logo = await readBrandLogo();
  if (!logo) return new Response(null, { status: 404 });

  return new Response(logo.buffer, {
    headers: {
      'Content-Type': logo.contentType,
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
