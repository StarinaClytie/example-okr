begin;
select plan(12);
insert into public.organizations(id,name) values('ed000000-0000-0000-0000-000000000001','Locale preference test');
insert into auth.users(id,email,email_confirmed_at) values
 ('ed000000-0000-0000-0000-000000000002','locale-new@example.test',now()),
 ('ed000000-0000-0000-0000-000000000003','locale-en@example.test',now()),
 ('ed000000-0000-0000-0000-000000000004','locale-zh@example.test',now());
insert into public.profiles(id,organization_id,display_name,approval_status) values
 ('ed000000-0000-0000-0000-000000000002','ed000000-0000-0000-0000-000000000001','Unspecified','approved');
insert into public.profiles(id,organization_id,display_name,approval_status,preferred_locale) values
 ('ed000000-0000-0000-0000-000000000003','ed000000-0000-0000-0000-000000000001','English','approved','en'),
 ('ed000000-0000-0000-0000-000000000004','ed000000-0000-0000-0000-000000000001','Chinese','approved','zh-CN');
select col_is_null('public','profiles','preferred_locale','language preference may remain unspecified');
select is((select column_default::text from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='preferred_locale'),null::text,'new profiles have no forced language default');
select is((select preferred_locale from public.profiles where display_name='Unspecified'),null::text,'omitted language stays unspecified');
select is((select preferred_locale from public.profiles where display_name='English'),'en','explicit English preference retained');
select is((select preferred_locale from public.profiles where display_name='Chinese'),'zh-CN','explicit Chinese preference retained');
set local role authenticated;
select set_config('request.jwt.claim.sub','ed000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.set_my_locale('en')$$,'unspecified user can explicitly choose English');
select is((select preferred_locale from public.profiles where id=auth.uid()),'en','English choice persisted');
select lives_ok($$select public.set_my_locale('zh-CN')$$,'user can switch to Chinese');
select is((select preferred_locale from public.profiles where id=auth.uid()),'zh-CN','Chinese choice persisted');
select throws_ok($$select public.set_my_locale('fr')$$,'22023','Locale is invalid','unsupported choice rejected');
select throws_ok($$select public.set_my_locale(null)$$,'22023','Locale is invalid','RPC still requires explicit supported choice');
select is((select preferred_locale from public.profiles where id=auth.uid()),'zh-CN','invalid choices do not change saved preference');
select * from finish();
rollback;
