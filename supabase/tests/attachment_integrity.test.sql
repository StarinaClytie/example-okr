begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
-- Operational users and resource fixtures mirror the resource access boundary:
-- only approved, active members with an active organization role may use OSS RPCs.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  '00000000-0000-0000-0000-000000000001',
  id,
  'authenticated',
  'authenticated',
  email,
  'not-used',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from (values
  ('35000000-0000-0000-0000-000000000001'::uuid, 'owner@resource-oss.test'),
  ('35000000-0000-0000-0000-000000000002'::uuid, 'peer@resource-oss.test'),
  ('35000000-0000-0000-0000-000000000003'::uuid, 'inactive@resource-oss.test'),
  ('35000000-0000-0000-0000-000000000004'::uuid, 'cross-org@resource-oss.test')
) as users(id, email);

insert into public.organizations (id, name) values
  ('33000000-0000-0000-0000-000000000001', 'Resource OSS Org A'),
  ('33000000-0000-0000-0000-000000000002', 'Resource OSS Org B');

insert into public.profiles (id, organization_id, display_name, email, clearance, is_active, onboarding_completed, approval_status) values
  ('35000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', 'Owner', 'owner@resource-oss.test', 'confidential', true, true, 'approved'),
  ('35000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000001', 'Peer', 'peer@resource-oss.test', 'confidential', true, true, 'approved'),
  ('35000000-0000-0000-0000-000000000003', '33000000-0000-0000-0000-000000000001', 'Inactive', 'inactive@resource-oss.test', 'confidential', false, true, 'approved'),
  ('35000000-0000-0000-0000-000000000004', '33000000-0000-0000-0000-000000000002', 'Cross Organization', 'cross-org@resource-oss.test', 'confidential', true, true, 'approved');

insert into public.user_roles (organization_id, profile_id, role, is_active) values
  ('33000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', 'employee', true),
  ('33000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000002', 'employee', true),
  ('33000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000003', 'employee', true),
  ('33000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000004', 'management', true);

insert into public.resources (id, organization_id, name, category, resource_kind, owner_id, location, status, created_by) values
  ('34000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', 'OSS Fixture Resource', 'tools', 'durable', '35000000-0000-0000-0000-000000000001', 'Test Lab', 'available', '35000000-0000-0000-0000-000000000001');


insert into public.resource_attachments (id, organization_id, resource_id, uploader_id, file_name, storage_path, mime_type, size_bytes) values
('36000000-0000-0000-0000-000000000099', '33000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', 'integrity.pdf', 'integrity/test.pdf', 'application/pdf', 4);
set local role service_role;
select lives_ok($$select public.confirm_resource_attachment_object_upload('36000000-0000-0000-0000-000000000099', 'verified-etag', 'application/pdf', 4)$$, 'verified resource upload succeeds');
reset role;
select is((select checksum from public.resource_attachments where id = '36000000-0000-0000-0000-000000000099'), 'verified-etag', 'resource persists verified checksum');
set local role service_role;
select throws_ok($$select public.confirm_resource_attachment_object_upload('36000000-0000-0000-0000-000000000099', 'different-etag', 'application/pdf', 4)$$, '42501', 'Pending attachment not found', 'finalized checksum cannot be replaced');
reset role;
select is((select checksum from public.resource_attachments where id = '36000000-0000-0000-0000-000000000099'), 'verified-etag', 'replayed confirmation preserves checksum');
select * from finish();
rollback;
