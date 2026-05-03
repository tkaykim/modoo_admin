import { createClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/';
  const origin = requestUrl.origin;

  // Validate the next parameter to prevent open redirects
  const isValidNext = next.startsWith('/') && !next.startsWith('//');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${isValidNext ? next : '/'}`);
    }
  }

  // Return the user to an error page
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
