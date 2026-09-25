-- Authorization fields are managed only through trusted, role-gated services.
-- SECURITY INVOKER is intentional: current_user must be the database caller.
CREATE OR REPLACE FUNCTION public.protect_profile_authorization_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS DISTINCT FROM 'customer' OR NEW.manufacturer_id IS NOT NULL OR NEW.factory_id IS NOT NULL THEN
      RAISE EXCEPTION 'Profile authorization fields require a trusted service' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.manufacturer_id IS DISTINCT FROM OLD.manufacturer_id
     OR NEW.factory_id IS DISTINCT FROM OLD.factory_id THEN
    RAISE EXCEPTION 'Profile authorization fields require a trusted service' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_profile_authorization_fields
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authorization_fields();
