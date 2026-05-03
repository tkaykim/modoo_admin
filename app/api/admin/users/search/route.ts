import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();

  // Get search query from params
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.trim().length < 2) {
    return NextResponse.json(
      { error: 'Search query must be at least 2 characters' },
      { status: 400 }
    );
  }

  try {
    // Search users by email (case-insensitive partial match)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, phone_number')
      .ilike('email', `%${query.trim()}%`)
      .limit(10);

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error searching users:', error);
    return NextResponse.json(
      { error: 'Failed to search users' },
      { status: 500 }
    );
  }
}
