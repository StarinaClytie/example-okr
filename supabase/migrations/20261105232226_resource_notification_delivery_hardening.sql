-- Keep authorization at the row lock boundary; a service-role identity alone is
-- not authorization to deliver an arbitrary organization's notification.
alter table public.resource_problem_notifications add column delivery_started_at timestamptz;
-- Previously attempted rows may already have reached the provider without an
-- idempotency key. Do not automatically resend those ambiguous legacy messages.
update public.resource_problem_notifications set delivery_started_at = now() - interval '24 hours'
where attempted_at is not null or status in ('sending', 'failed');

create function private.can_deliver_resource_notification(
  p_caller_id uuid, p_notification_id uuid, p_initial_report boolean
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.resource_problem_notifications n
    join public.resource_problems rp on rp.id = n.problem_id and rp.organization_id = n.organization_id
    join public.resources r on r.id = rp.resource_id and r.organization_id = n.organization_id
    join public.profiles p on p.id = p_caller_id and p.organization_id = n.organization_id
    where n.id = p_notification_id and p.is_active and p.approval_status = 'approved'
      and exists (select 1 from public.user_roles ur where ur.profile_id = p.id
        and ur.organization_id = p.organization_id and ur.is_active)
      and (r.owner_id = p.id
        or exists (select 1 from public.user_roles ur where ur.profile_id = p.id
          and ur.organization_id = p.organization_id and ur.is_active
          and ur.role in ('management', 'administrator'))
        or (p_initial_report and rp.reporter_id = p.id and n.status = 'pending'
          and n.attempted_at is null and n.delivery_started_at is null))
  );
$$;
revoke all on function private.can_deliver_resource_notification(uuid, uuid, boolean) from public, anon, authenticated;

-- Remove the old service-only primitive that had no caller authorization.
drop function public.claim_resource_problem_notification(uuid);
create function public.claim_resource_problem_notification(p_notification_id uuid, p_caller_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare n public.resource_problem_notifications%rowtype;
begin
  select * into n from public.resource_problem_notifications where id = p_notification_id for update;
  if not found then return 'not_found'; end if;
  if not private.can_deliver_resource_notification(p_caller_id, p_notification_id, true) then return 'forbidden'; end if;
  if n.status = 'sent' then return 'sent'; end if;
  -- Resend retains keys for 24h. Stop after 23h, leaving margin for transport
  -- delay. An operator must reconcile older ambiguous attempts with the provider.
  if n.delivery_started_at <= now() - interval '23 hours' then return 'retry_window_expired'; end if;
  if n.status = 'sending' and n.attempted_at >= now() - interval '5 minutes' then return 'in_progress'; end if;
  update public.resource_problem_notifications
    set status = 'sending', attempted_at = now(),
        delivery_started_at = coalesce(delivery_started_at, now()), error_code = null
    where id = n.id;
  return 'claimed';
end;
$$;
revoke all on function public.claim_resource_problem_notification(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_resource_problem_notification(uuid, uuid) to service_role;

-- The UI's retry entry point and actual delivery share the same role policy.
create or replace function public.retry_resource_problem_notification(p_problem_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n public.resource_problem_notifications%rowtype;
begin
  select * into n from public.resource_problem_notifications where problem_id = p_problem_id for update;
  if not found or not private.can_deliver_resource_notification(auth.uid(), n.id, false) then
    raise exception 'Notification is not retryable by the current user' using errcode = '42501';
  end if;
  return jsonb_build_object('problemId', p_problem_id, 'notificationId', n.id,
    'status', n.status::text, 'errorCode', n.error_code);
end;
$$;
revoke all on function public.retry_resource_problem_notification(uuid) from public, anon;
grant execute on function public.retry_resource_problem_notification(uuid) to authenticated;

-- Complete provider request snapshot: this audit table already denies browser
-- SELECT/UPDATE. Only the service role can establish/read the delivery payload.
alter table public.resource_problem_notifications add column delivery_payload jsonb;
create function public.snapshot_resource_problem_notification(p_notification_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n public.resource_problem_notifications%rowtype;
begin
  select * into n from public.resource_problem_notifications where id = p_notification_id for update;
  if not found or n.status <> 'sending' or n.delivery_started_at <= now() - interval '23 hours' then
    raise exception 'No active delivery claim' using errcode = '55000';
  end if;
  if n.delivery_payload is not null then return n.delivery_payload; end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
     or not (p_payload ?& array['from', 'to', 'subject', 'text'])
     or exists (select 1 from jsonb_each(p_payload) x
       where x.key not in ('from', 'to', 'subject', 'text') or jsonb_typeof(x.value) <> 'string') then
    raise exception 'Invalid delivery payload' using errcode = '22023';
  end if;
  update public.resource_problem_notifications set delivery_payload = p_payload where id = n.id;
  return p_payload;
end;
$$;
revoke all on function public.snapshot_resource_problem_notification(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.snapshot_resource_problem_notification(uuid, jsonb) to service_role;
