\set ON_ERROR_STOP 0
insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','a@x.ch','{"full_name":"Anna"}'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b@x.ch','{}'),
 ('cccccccc-0000-0000-0000-000000000003','c@x.ch','{}');
select name from public.profiles order by email;

set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false), set_config('request.jwt.claim.email','a@x.ch',false) \gset
insert into public.lists (name) values ('Haushalt') returning id \gset
\echo list :id
insert into public.tasks (list_id,title) values (:'id','Einkaufen');
select public.create_invite(:'id','editor','b@x.ch') as tok \gset

select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000003',false), set_config('request.jwt.claim.email','c@x.ch',false) \gset
\echo -- C (Fremde) sieht:
select count(*) as lists_c from public.lists;
select count(*) as tasks_c from public.tasks;
insert into public.tasks (list_id,title) values (:'id','Hack');
select public.accept_invite('falsch');
select count(*) as profiles_c from public.profiles;

select set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000002',false), set_config('request.jwt.claim.email','b@x.ch',false) \gset
select public.claim_email_invites() as claimed;
select count(*) as tasks_b from public.tasks;
select count(*) as profiles_b from public.profiles;
insert into public.tasks (list_id,title,assignee_id) values (:'id','Waschen','bbbbbbbb-0000-0000-0000-000000000002');
update public.lists set name='Gehackt' where id=:'id';
select name from public.lists;
select public.create_invite(:'id') ;
select action, diff is not null as has_diff from public.activity_log order by id;
select public.rotate_calendar_token() is not null as token_ok;
select public.delete_my_account();
reset role;
select count(*) as users_left from auth.users;
select count(*) as lists_left from public.lists;
set role anon;
select count(*) from public.tasks;
