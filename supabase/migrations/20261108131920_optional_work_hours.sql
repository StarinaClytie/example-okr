-- Opt-out controls future collection; existing report/revision values are retained.
alter table public.organizations add column work_hours_enabled boolean not null default true;

create function public.update_organization_work_hours(p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare target_org uuid := private.current_organization_id();
begin
  if target_org is null or not private.is_operational() or not private.has_role('administrator') then
    raise exception 'Only administrators can update organization work hours' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'Work hours setting must be true or false' using errcode = '22023';
  end if;
  update public.organizations set work_hours_enabled = p_enabled where id = target_org;
end
$$;
revoke all on function public.update_organization_work_hours(boolean) from public, anon;
grant execute on function public.update_organization_work_hours(boolean) to authenticated;

-- Table triggers cover all save overloads, including privileged legacy paths.
-- A confirmation/metadata UPDATE must never erase a historical report total.
create function private.normalize_report_work_hours()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not (select o.work_hours_enabled from public.organizations o where o.id = new.organization_id) then
    if tg_op = 'INSERT' then
      new.total_hours := 0;
    elsif new.total_hours is distinct from old.total_hours
       or new.current_revision is distinct from old.current_revision then
      new.total_hours := 0;
    end if;
  end if;
  return new;
end
$$;
create function private.normalize_block_work_hours()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not (select o.work_hours_enabled from public.organizations o where o.id = new.organization_id) then
    if tg_op = 'INSERT' then
      new.hours := 0;
    elsif new.hours is distinct from old.hours then
      new.hours := 0;
    end if;
  end if;
  return new;
end
$$;
revoke all on function private.normalize_report_work_hours() from public, anon, authenticated;
revoke all on function private.normalize_block_work_hours() from public, anon, authenticated;
create trigger normalize_report_work_hours before insert or update on public.daily_reports
for each row execute function private.normalize_report_work_hours();
create trigger normalize_block_work_hours before insert or update on public.daily_okr_blocks
for each row execute function private.normalize_block_work_hours();
-- Retained legacy revision KR writes receive the same collection guarantee.
create trigger normalize_revision_kr_work_hours before insert or update on public.daily_report_revision_krs
for each row execute function private.normalize_block_work_hours();

-- Add one organization guard to the installed HR function, preserving its
-- current result shape, authorization, owner, signature, and EXECUTE grants.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.get_hr_work_hours(date,date)'::regprocedure) into definition;
  if position('if caller_org is null or not private.has_role(''hr'') then' in definition) = 0 then
    raise exception 'Unexpected HR work hours definition';
  end if;
  execute replace(definition,
    'if caller_org is null or not private.has_role(''hr'') then',
    'if caller_org is null or not private.has_role(''hr'') or not exists (select 1 from public.organizations o where o.id = caller_org and o.work_hours_enabled) then');
end
$migration$;
-- HR needs aggregate visibility beyond ordinary report-reader RLS. Preserve
-- the scoped security-barrier view and its grants, adding only the opt-out guard.
create or replace view public.hr_workload with (security_barrier = true) as
select dr.author_id as user_id, dr.report_date,
  sum(dr.total_hours) as total_hours,
  null::numeric as planned_hours, 8::numeric as capacity_hours
from public.daily_reports dr
where dr.organization_id = private.current_organization_id()
  and private.has_role('hr')
  and exists (select 1 from public.organizations o
    where o.id = dr.organization_id and o.work_hours_enabled)
group by dr.author_id, dr.report_date;

notify pgrst, 'reload schema';
