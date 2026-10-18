-- Run as database owner in SQL Editor on a NEW, migrated instance only.
-- First create and email-confirm an Auth user. Replace the three values below.
-- This DO block is atomic; it installs no function or public endpoint.
DO $bootstrap$
DECLARE
  v_user_id uuid := '00000000-0000-0000-0000-000000000000';
  v_organization_name text := 'My organization';
  v_display_name text := 'Administrator';
  v_user_email text;
  v_organization_id uuid;
BEGIN
  -- Serialize concurrent bootstrap attempts; no other setup may race this one.
  LOCK TABLE public.organizations, public.profiles, public.user_roles IN EXCLUSIVE MODE;
  IF v_user_id = '00000000-0000-0000-0000-000000000000'::uuid
     OR nullif(trim(v_organization_name), '') IS NULL
     OR nullif(trim(v_display_name), '') IS NULL THEN
    RAISE EXCEPTION 'Set a real user_id and nonempty organization_name/display_name';
  END IF;
  SELECT email INTO v_user_email FROM auth.users
    WHERE id = v_user_id AND email_confirmed_at IS NOT NULL AND nullif(email, '') IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bootstrap requires an existing email-confirmed Auth user';
  END IF;

  -- Exact repeated execution is a no-op, never an account promotion/repair tool.
  IF (SELECT count(*) FROM public.organizations) = 1
     AND (SELECT count(*) FROM public.profiles) = 1
     AND (SELECT count(*) FROM public.user_roles) = 1
     AND EXISTS (
       SELECT 1 FROM public.profiles p
       JOIN public.organizations o ON o.id = p.organization_id
       JOIN public.user_roles r ON r.profile_id = p.id AND r.organization_id = o.id
       WHERE p.id = v_user_id AND p.email = v_user_email
         AND p.display_name = trim(v_display_name) AND o.name = trim(v_organization_name)
         AND p.is_active AND p.approval_status = 'approved' AND p.onboarding_completed
         AND r.role = 'administrator' AND r.is_active
     ) THEN
    RAISE NOTICE 'Initial administrator already configured; no changes';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations)
     OR EXISTS (SELECT 1 FROM public.profiles)
     OR EXISTS (SELECT 1 FROM public.user_roles) THEN
    RAISE EXCEPTION 'Bootstrap refused: business identity tables are not empty';
  END IF;
  INSERT INTO public.organizations (name) VALUES (trim(v_organization_name)) RETURNING id INTO v_organization_id;
  INSERT INTO public.profiles (id, organization_id, display_name, email, is_active, approval_status, onboarding_completed)
    VALUES (v_user_id, v_organization_id, trim(v_display_name), v_user_email, true, 'approved', true);
  INSERT INTO public.user_roles (organization_id, profile_id, role, is_active)
    VALUES (v_organization_id, v_user_id, 'administrator', true);
END;
$bootstrap$;
