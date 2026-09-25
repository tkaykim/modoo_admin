import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { isSuperAdmin } from '@/lib/auth-helpers';

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (!isSuperAdmin(profile?.role)) redirect('/dashboard');
  return children;
}
