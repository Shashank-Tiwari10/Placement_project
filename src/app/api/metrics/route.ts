import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { getMeasureSnapshot } from '@/lib/repository';

export async function GET(request: NextRequest) {
  const auth = await requirePrincipal(['head', 'manager']);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const asOfParam = request.nextUrl.searchParams.get('asOf');
    const asOf = asOfParam && asOfParam !== 'latest' ? asOfParam : null;
    if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      return NextResponse.json(
        { error: 'Invalid asOf parameter. Expected YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    const snapshot = await getMeasureSnapshot(asOf);
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error('[GET /api/metrics] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to compute metrics' },
      { status: 500 }
    );
  }
}
