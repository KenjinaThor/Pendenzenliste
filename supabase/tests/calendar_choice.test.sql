-- Tests: Kalender-Auswahl pro Pendenz (in_calendar) und Standard im Profil
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('c1111111-0000-0000-0000-000000000001', 'cora@x.ch', '{"full_name":"Cora"}');
\set cora '\'c1111111-0000-0000-0000-000000000001\''

set role authenticated;
select set_config('request.jwt.claim.sub', :cora, false), set_config('request.jwt.claim.email', 'cora@x.ch', false) \gset
insert into public.lists (name) values ('Privat') returning id as list \gset

select test.ok('Profil-Standard ist «ja»', (select calendar_default from public.profiles where id = :cora));
update public.profiles set calendar_default = false where id = :cora;
select test.ok('Profil-Standard lässt sich ändern', not (select calendar_default from public.profiles where id = :cora));

insert into public.tasks (list_id, title) values (:'list', 'Standard') returning id as t1 \gset
insert into public.tasks (list_id, title, in_calendar, rrule, due_at)
  values (:'list', 'Ohne Kalender', false, 'FREQ=DAILY', now()) returning id as t2 \gset
select test.ok('Neue Pendenz ist standardmässig im Kalender', (select in_calendar from public.tasks where id = :'t1'));

select public.update_task_fields(:'t1', '{"in_calendar":false}', '2026-11-01 10:00+00');
select test.ok('in_calendar lässt sich über die Synchronisierung ändern',
  not (select in_calendar from public.tasks where id = :'t1'));
select public.update_task_fields(:'t1', '{"in_calendar":true}', '2026-11-01 09:00+00');
select test.ok('Ältere Änderung an in_calendar verliert', not (select in_calendar from public.tasks where id = :'t1'));

select public.complete_recurring_task(:'t2', now() + interval '1 day') as clone \gset
select test.ok('Folge-Pendenz übernimmt die Kalender-Auswahl',
  (select count(*) = 1 and bool_and(not in_calendar) from public.tasks where id = :'clone'));

-- Migration 8 darf nach Migration 7 nochmals laufen und liefert zusätzlich die Standardliste
reset role;
\i supabase/migrations/20261028000008_settings_defaults.sql
set role authenticated;
select set_config('request.jwt.claim.sub', :cora, false), set_config('request.jwt.claim.email', 'cora@x.ch', false) \gset
update public.profiles set default_list_id = :'list' where id = :cora;
select test.ok('Standardliste lässt sich im Profil speichern',
  (select default_list_id = :'list'::uuid from public.profiles where id = :cora));
reset role;
delete from public.lists where id = :'list';
select test.ok('Wird die Standardliste gelöscht, ist sie im Profil leer',
  (select default_list_id is null from public.profiles where id = :cora));
