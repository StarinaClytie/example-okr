-- Preserve the existing calendar without reinterpreting any historical date.
-- The temporary default backfills existing rows; future organizations use UTC.
alter table public.organizations
  add column business_time_zone text not null default 'Asia/Shanghai',
  add column week_starts_on integer not null default 1
    constraint organizations_week_starts_on_check check (week_starts_on in (0, 1));
alter table public.organizations alter column business_time_zone set default 'UTC';

create function private.is_valid_business_time_zone(p_time_zone text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select p_time_zone is not null and exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_time_zone
  )
$$;
revoke all on function private.is_valid_business_time_zone(text) from public, anon;
grant execute on function private.is_valid_business_time_zone(text) to authenticated;
alter table public.organizations add constraint organizations_business_time_zone_check
  check (private.is_valid_business_time_zone(business_time_zone));

-- Read only the caller's operational organization. A missing/disabled identity
-- resolves no date, so callers retain their existing fail-closed authorization.
create function private.current_business_date(p_at timestamptz default now())
returns date language sql stable security definer set search_path = '' as $$
  select (p_at at time zone organization.business_time_zone)::date
  from public.organizations organization
  where organization.id = private.current_organization_id()
    and private.is_operational()
$$;
revoke all on function private.current_business_date(timestamptz) from public, anon;
grant execute on function private.current_business_date(timestamptz) to authenticated;

create function public.update_organization_calendar(p_time_zone text, p_week_starts_on integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_org uuid := private.current_organization_id();
begin
  if target_org is null or not private.is_operational() or not private.has_role('administrator') then
    raise exception 'Only administrators can update the organization calendar' using errcode = '42501';
  end if;
  if not private.is_valid_business_time_zone(p_time_zone) then
    raise exception 'Invalid business time zone' using errcode = '22023';
  end if;
  if p_week_starts_on is null or p_week_starts_on not in (0, 1) then
    raise exception 'Week must start on Sunday or Monday' using errcode = '22023';
  end if;
  update public.organizations
  set business_time_zone = p_time_zone, week_starts_on = p_week_starts_on
  where id = target_org;
end
$$;
revoke all on function public.update_organization_calendar(text, integer) from public, anon;
grant execute on function public.update_organization_calendar(text, integer) to authenticated;

-- Patch only calendar expressions in the installed function definitions. This
-- deliberately preserves every existing lock, authorization guard, overload,
-- SECURITY DEFINER/search_path option, owner, and EXECUTE grant. Replaying an old
-- whole-function definition here could silently restore an obsolete guard.
do $migration$
declare
  target record;
  original_definition text;
  updated_definition text;
  shanghai_expression constant text := '(timezone(''Asia/Shanghai'', now()))::date';
  allowed_names constant text[] := array[
    'begin_attachment_upload', 'soft_delete_attachment', 'can_insert_attachment_object',
    'begin_entry_attachment_upload', 'authorize_attachment_revision_removal',
    'abandon_daily_report_upload_session', 'begin_daily_report_upload_session',
    'begin_daily_report_upload_session_impl_20260823',
    'save_daily_report_session_impl_20260823',
    'save_daily_report_without_block_projects_20260827',
    'save_daily_report_without_block_projects_legacy_20260827',
    'save_daily_report', 'adopt_daily_report_revision_attachments',
    'authorize_attachment_object_upload', 'confirm_attachment_object_upload',
    'request_attachment_object_deletion', 'create_objective', 'create_key_result',
    'save_kr_progress'
  ];
begin
  for target in
    select p.oid, p.proname, p.prosrc
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f'
      and (position('Asia/Shanghai' in p.prosrc) > 0 or p.prosrc ~* '\mcurrent_date\M')
  loop
    if not target.proname = any(allowed_names) then
      raise exception 'Unexpected business-date function: %', target.oid::regprocedure;
    end if;
    original_definition := pg_catalog.pg_get_functiondef(target.oid);
    updated_definition := replace(original_definition, shanghai_expression, 'private.current_business_date()');
    updated_definition := regexp_replace(updated_definition, '\mcurrent_date\M', 'private.current_business_date()', 'gi');
    if position('Asia/Shanghai' in updated_definition) > 0 or updated_definition = original_definition then
      raise exception 'Unrecognized business-date expression: %', target.oid::regprocedure;
    end if;
    execute updated_definition;
  end loop;
end
$migration$;
