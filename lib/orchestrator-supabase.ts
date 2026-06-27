import { createClient } from '@supabase/supabase-js';

export function createOrchestratorAdminClient() {
  const supabaseUrl =
    process.env.ORCHESTRATOR_SUPABASE_URL ||
    process.env.SUPABASE_URL_ORCHESTRATOR;
  const serviceRoleKey =
    process.env.ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY_ORCHESTRATOR;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
