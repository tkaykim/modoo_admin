CREATE TABLE IF NOT EXISTS public.order_deletion_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  deleted_by uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL,
  snapshot jsonb NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_deletion_logs_order_id_idx
  ON public.order_deletion_logs(order_id);
CREATE INDEX IF NOT EXISTS order_deletion_logs_deleted_at_idx
  ON public.order_deletion_logs(deleted_at DESC);

ALTER TABLE public.order_deletion_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin select" ON public.order_deletion_logs;
CREATE POLICY "super_admin select" ON public.order_deletion_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );
