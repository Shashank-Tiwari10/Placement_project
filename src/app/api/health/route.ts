import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';

export async function GET() {
  const hasSupabase =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project-ref');

  const hasGemini =
    Boolean(process.env.GEMINI_API_KEY) &&
    !process.env.GEMINI_API_KEY?.includes('your-gemini-api-key');

  if (!hasSupabase) {
    return NextResponse.json(
      {
        ok: false,
        stage: 'phase-0',
        supabaseConfigured: false,
        geminiConfigured: hasGemini,
        message: 'Supabase credentials not yet configured in .env.local',
      },
      { status: 503 }
    );
  }

  try {
    const supabase = getServerSupabase();
    const { count, error } = await supabase
      .from('brands')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return NextResponse.json(
        { ok: false, supabaseConfigured: true, geminiConfigured: hasGemini, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      supabaseConfigured: true,
      geminiConfigured: hasGemini,
      brandsCount: count ?? 0,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        supabaseConfigured: hasSupabase,
        geminiConfigured: hasGemini,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
