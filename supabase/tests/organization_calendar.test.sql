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
create temporary table calendar_history as select id,report_date from public.daily_reports;
set local role authenticated;
select set_config('request.jwt.claim.sub','cb000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.update_organization_calendar('America/New_York',0)$$,'administrator changes own calendar');
select is((select business_time_zone from public.organizations where name='Calendar A'),'America/New_York','calendar saved');
select is((select private.current_business_date('2026-03-08 04:30:00+00')),date '2026-03-07','before DST midnight uses previous day');
select is((select private.current_business_date('2026-03-09 04:30:00+00')),date '2026-03-09','after DST midnight uses new offset');
select is((select private.current_business_date('2026-11-01 04:30:00+00')),date '2026-11-01','fall DST pre-transition midnight');
select is((select private.current_business_date('2026-11-02 04:30:00+00')),date '2026-11-01','fall DST post-transition date boundary');
-- These zones are always on different calendar dates at the same instant.
select lives_ok($$select public.update_organization_calendar('Pacific/Kiritimati',1)$$,'change to UTC+14 business calendar');
select lives_ok($$select public.begin_daily_report_upload_session(private.current_business_date(),'draft','internal')$$,'upload accepts organization current date');
select throws_ok($$select public.begin_daily_report_upload_session((now() at time zone 'Pacific/Honolulu')::date,'draft','internal')$$,'42501',null,'upload rejects another calendar date');
select lives_ok($$select public.save_daily_report(private.current_business_date(),'draft','internal','[{"projectId":"cc000000-0000-0000-0000-000000000001","dailyObjective":"Historical consistency","workDescription":"Calendar work","result":"Done","hours":1}]'::jsonb,(public.begin_daily_report_upload_session(private.current_business_date(),'draft','internal')->>'sessionId')::uuid,'[]'::jsonb)$$,'save accepts organization current date');
select throws_ok($$select public.save_daily_report((now() at time zone 'Pacific/Honolulu')::date,'draft','internal','[{"projectId":"cc000000-0000-0000-0000-000000000001","dailyObjective":"Wrong day","workDescription":"Calendar work","result":"Done","hours":1}]'::jsonb,(public.begin_daily_report_upload_session(private.current_business_date(),'draft','internal')->>'sessionId')::uuid,'[]'::jsonb)$$,'42501',null,'save rejects another calendar date');
select throws_ok($$select public.update_organization_calendar('Not/A_Zone',1)$$,'22023',null,'unknown timezone rejected');
select throws_ok($$select public.update_organization_calendar(null,1)$$,'22023',null,'null timezone rejected');
select throws_ok($$select public.update_organization_calendar('UTC',2)$$,'22023',null,'invalid weekday rejected');
select throws_ok($$select public.update_organization_calendar('UTC',null)$$,'22023',null,'null weekday rejected');
select set_config('request.jwt.claim.sub','cb000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.update_organization_calendar('UTC',1)$$,'42501',null,'employee cannot change calendar');
select set_config('request.jwt.claim.sub','cb000000-0000-0000-0000-000000000003',true);
select is(private.current_business_date('2026-01-01 00:00:00+00'),null::date,'inactive user resolves no business date');
select throws_ok($$select public.update_organization_calendar('UTC',1)$$,'42501',null,'inactive administrator cannot change calendar');
reset role;
select is((select business_time_zone from public.organizations where name='Calendar B'),'UTC','other organization unchanged');
select results_eq('select id,report_date from public.daily_reports where id in (select id from calendar_history) order by id','select id,report_date from calendar_history order by id','historical report dates unchanged');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' and p.proname in ('create_objective','create_key_result','save_kr_progress') and p.prosrc ~* '\mcurrent_date\M'),0,'deadline and progress guards use organization calendar');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' and p.prosrc like '%Asia/Shanghai%'),0,'all live functions use organization business date');
set local role anon;
select throws_ok($$select public.update_organization_calendar('UTC',1)$$,'42501',null,'anonymous calls denied');
reset role;
select * from finish();
rollback;
