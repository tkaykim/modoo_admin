-- Allow a marketing-only operator role for the online modoo_admin marketing console.
-- This keeps existing legacy roles, including manufacturer, while adding marketing_manager.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (
    role = ANY (
      ARRAY[
        'admin'::text,
        'customer'::text,
        'factory'::text,
        'manufacturer'::text,
        'super_admin'::text,
        'marketing_manager'::text
      ]
    )
  );
