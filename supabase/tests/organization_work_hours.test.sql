begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into public.organizations(id,name) values
 ('ca000000-0000-0000-0000-000000000001','Calendar A'),
 ('ca000000-0000-0000-0000-000000000002','Calendar B');
select is((select business_time_zone from public.organizations where name='Calendar A'),'UTC','future organizations default to UTC');
select is((select week_starts_on from public.organizations where name='Calendar A'),1,'future organizations default to Monday');
insert into auth.users(id,email) values
 ('cb000000-0000-0000-0000-000000000001','calendar-admin@test.invalid'),
 ('cb000000-0000-0000-0000-000000000002','calendar-employee@test.invalid'),
 ('cb000000-0000-0000-0000-000000000003','calendar-inactive@test.invalid');
insert into public.profiles(id,organization_id,display_name,is_active,approval_status) values
 ('cb000000-0000-0000-0000-000000000001','ca000000-0000-0000-0000-000000000001','Admin',true,'approved'),
 ('cb000000-0000-0000-0000-000000000002','ca000000-0000-0000-0000-000000000001','Employee',true,'approved'),
 ('cb000000-0000-0000-0000-000000000003','ca000000-0000-0000-0000-000000000001','Inactive',false,'approved');
insert into public.user_roles(organization_id,profile_id,role,is_active) values
 ('ca000000-0000-0000-0000-000000000001','cb000000-0000-0000-0000-000000000001','administrator',true),
 ('ca000000-0000-0000-0000-000000000001','cb000000-0000-0000-0000-000000000002','employee',true),
 ('ca000000-0000-0000-0000-000000000001','cb000000-0000-0000-0000-000000000003','administrator',true);
insert into public.projects(id,organization_id,name,leader_id,classification,start_date,due_date) values
 ('cc000000-0000-0000-0000-000000000001','ca000000-0000-0000-0000-000000000001','Calendar project','cb000000-0000-0000-0000-000000000001','internal','2020-01-01','2030-01-01');
insert into public.daily_reports(organization_id,author_id,report_date) values
 ('ca000000-0000-0000-0000-000000000001','cb000000-0000-0000-0000-000000000001','2020-01-01');

insert into auth.users(id,email) values ('cb000000-0000-0000-0000-000000000004','other-org-hours@test.invalid');
insert into public.profiles(id,organization_id,display_name,approval_status) values ('cb000000-0000-0000-0000-000000000004','ca000000-0000-0000-0000-000000000002','Other tenant','approved');
insert into public.daily_reports(organization_id,author_id,report_date,total_hours) values ('ca000000-0000-0000-0000-000000000002','cb000000-0000-0000-0000-000000000004',current_date,6);
select has_column('public','organizations','work_hours_enabled','organizations have collection setting');
select ok(to_regprocedure('public.update_organization_work_hours(boolean)') is not null,'setting RPC exists');


select is((select work_hours_enabled from public.organizations where name='Calendar A'),true,'collection defaults enabled');
set local role authenticated;
select set_config('request.jwt.claim.sub','cb000000-0000-0000-0000-000000000001',true);
create function pg_temp.save_hours(p_hours numeric) returns void language plpgsql as $$
begin
perform public.save_daily_report(private.current_business_date(),'draft','internal',jsonb_build_array(jsonb_build_object('projectId','cc000000-0000-0000-0000-000000000001','dailyObjective','Evidence','workDescription','Work','result','Done','hours',p_hours)),(public.begin_daily_report_upload_session(private.current_business_date(),'draft','internal')->>'sessionId')::uuid,'[]'::jsonb);
end
$$;
select lives_ok($$select pg_temp.save_hours(3)$$,'enabled saves retain compatibility');
select is((select total_hours from public.daily_reports where report_date=private.current_business_date()),3::numeric,'enabled report collects hours');
select lives_ok($$select public.update_organization_work_hours(false)$$,'admin disables own collection');
select throws_ok($$select public.update_organization_work_hours(null)$$,'22023',null,'null setting rejected');
reset role;
select is((select work_hours_enabled from public.organizations where name='Calendar B'),true,'other organization unchanged');
select is((select total_hours from public.daily_reports where report_date=(now() at time zone 'UTC')::date and organization_id='ca000000-0000-0000-0000-000000000001'),3::numeric,'toggle retains historical report');
update public.daily_reports set status='confirmed' where total_hours=3;
select is((select total_hours from public.daily_reports where total_hours=3),3::numeric,'confirmation update retains historical hours');
set local role authenticated;
select throws_ok($$select pg_temp.save_hours(3)$$,'42501',null,'disabled collection preserves confirmed-report lock');
reset role;
update public.daily_reports set status='draft' where total_hours=3;
insert into public.daily_reports(organization_id,author_id,report_date,total_hours) values ('ca000000-0000-0000-0000-000000000001','cb000000-0000-0000-0000-000000000001','2020-01-02',5);
select is((select total_hours from public.daily_reports where report_date='2020-01-02'),0::numeric,'disabled direct report insert normalized');
select is((select hours from public.daily_okr_blocks limit 1),3::numeric,'toggle retains historical blocks');
set local role authenticated;
select lives_ok($$select pg_temp.save_hours(3)$$,'disabled mode still saves evidence revisions');
select is((select total_hours from public.daily_reports where report_date=private.current_business_date()),0::numeric,'disabled revision total normalized');
select is((select b.hours from public.daily_okr_blocks b join public.daily_report_revisions r on r.id=b.revision_id order by r.revision_number desc limit 1),0::numeric,'disabled new block normalized');
select is((select b.hours from public.daily_okr_blocks b join public.daily_report_revisions r on r.id=b.revision_id order by r.revision_number limit 1),3::numeric,'older revision block retained');
select set_config('request.jwt.claim.sub','cb000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.update_organization_work_hours(true)$$,'42501',null,'employee denied');
update public.organizations set work_hours_enabled=true;
select is((select work_hours_enabled from public.organizations where name='Calendar A'),false,'direct setting update cannot change organization');
select set_config('request.jwt.claim.sub','cb000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.update_organization_work_hours(true)$$,'42501',null,'inactive admin denied');
reset role;
update public.user_roles set role='hr' where profile_id='cb000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','cb000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.get_hr_work_hours(current_date-1,current_date+1)$$,'42501',null,'HR hours blocked while disabled');
select is((select count(*)::integer from public.hr_workload),0,'legacy HR workload hides disabled organization hours');
select set_config('request.jwt.claim.sub','cb000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.update_organization_work_hours(true)$$,'admin reenables collection');
select lives_ok($$select pg_temp.save_hours(4)$$,'reenabled writes work');
select is((select total_hours from public.daily_reports where report_date=private.current_business_date()),4::numeric,'reenabled hours collected');
select set_config('request.jwt.claim.sub','cb000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.get_hr_work_hours(current_date-1,current_date+1)$$,'HR RPC restored when enabled');
select ok((select count(*) from public.hr_workload)>0,'legacy HR workload restored when enabled');
select ok(not exists(select 1 from public.hr_workload where user_id <> 'cb000000-0000-0000-0000-000000000001'),'legacy HR view keeps organization scope');
reset role;
set local role anon;
select throws_ok($$select public.update_organization_work_hours(false)$$,'42501',null,'anonymous denied');
reset role;
select * from finish(); rollback;
