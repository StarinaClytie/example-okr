-- Match daily-report evidence: persist the server-verified OSS ETag.
-- Keep historical migrations unchanged for already-deployed databases.
alter table public.resource_attachments add column if not exists checksum text;

create or replace function public.confirm_resource_attachment_object_upload(
  p_attachment_id uuid,
  p_checksum text,
  p_mime_type text,
  p_byte_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.resource_attachments%rowtype;
begin
  select * into target
  from public.resource_attachments
  where id = p_attachment_id
    and state = 'pending'
    and object_verified_at is null
    and object_deleted_at is null
  for update;
  if not found then
    raise exception 'Pending attachment not found' using errcode = '42501';
  end if;
  if target.size_bytes::bigint <> p_byte_size or target.mime_type <> p_mime_type then
    raise exception 'Uploaded object metadata does not match attachment' using errcode = '22023';
  end if;

  update public.resource_attachments
  set state = 'uploaded',
      checksum = nullif(p_checksum, ''),
      object_verified_at = timezone('utc', now()),
      object_deleted_at = null
  where id = target.id;

  return jsonb_build_object('id', target.id);
end;
$$;

-- CREATE OR REPLACE preserves the existing service-role-only execute grant.
select pg_notify('pgrst', 'reload schema');
