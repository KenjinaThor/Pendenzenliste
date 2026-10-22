-- Tests: wiederkehrende Pendenzen erledigen und rückgängig machen
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('f1111111-0000-0000-0000-000000000001', 'fabio@x.ch', '{"full_name":"Fabio"}'),
  ('f2222222-0000-0000-0000-000000000002', 'gina@x.ch', '{"full_name":"Gina"}');
\set fabio '\'f1111111-0000-0000-0000-000000000001\''
\set gina '\'f2222222-0000-0000-0000-000000000002\''

set role authenticated;
select set_config('request.jwt.claim.sub', :fabio, false), set_config('request.jwt.claim.email', 'fabio@x.ch', false) \gset
insert into public.lists (name) values ('Haushalt') returning id as list \gset
select public.create_invite(:'list', 'editor', 'gina@x.ch') as tok \gset
select set_config('request.jwt.claim.sub', :gina, false), set_config('request.jwt.claim.email', 'gina@x.ch', false) \gset
select public.claim_email_invites();
select set_config('request.jwt.claim.sub', :fabio, false), set_config('request.jwt.claim.email', 'fabio@x.ch', false) \gset

insert into public.tags (list_id, name) values (:'list', 'putzen') returning id as tag \gset
insert into public.tasks (list_id, title, notes_md, due_at, due_all_day, priority, assignee_id, rrule)
values (:'list', 'Bad putzen', 'mit Essig', '2026-11-05 23:00+00', true, 'high', :gina, 'FREQ=WEEKLY')
returning id as t \gset
insert into public.subtasks (task_id, title, done, position) values (:'t', 'Spiegel', true, 0), (:'t', 'Dusche', false, 1);
insert into public.task_tags (task_id, tag_id) values (:'t', :'tag');
insert into public.reminders (task_id, offset_min) values (:'t', 1440);
insert into public.tasks (list_id, title) values (:'list', 'Einmalig') returning id as once \gset

select test.ok('Nicht wiederkehrende Pendenz lässt sich so nicht abschliessen',
  test.throws(format($q$select public.complete_recurring_task(%L, now())$q$, :'once')));

select public.complete_recurring_task(:'t', '2026-11-12 23:00+00') as clone \gset
select test.ok('Folge-Pendenz hat neuen Termin und gleiche Eigenschaften',
  (select due_at = '2026-11-12 23:00+00' and title = 'Bad putzen' and notes_md = 'mit Essig'
          and priority = 'high' and assignee_id = :gina and rrule = 'FREQ=WEEKLY'
          and status = 'open' and due_all_day
   from public.tasks where id = :'clone'));
select test.ok('Unteraufgaben werden kopiert und zurückgesetzt',
  (select count(*) from public.subtasks where task_id = :'clone') = 2
  and (select count(*) from public.subtasks where task_id = :'clone' and done) = 0);
select test.ok('Tags werden übernommen', (select count(*) from public.task_tags where task_id = :'clone' and tag_id = :'tag') = 1);
select test.ok('Erinnerungen werden übernommen und neu berechnet',
  (select fire_at from public.reminders where task_id = :'clone') = '2026-11-12 08:00+00'); -- 13.11. in Zürich, 1 Tag vorher, 09:00 Uhr
select test.ok('Original ist erledigt und wiederholt sich nicht mehr',
  (select status = 'done' and rrule is null and completed_at is not null from public.tasks where id = :'t'));
select test.ok('Original behält seine Unteraufgaben', (select count(*) from public.subtasks where task_id = :'t') = 2);

select set_config('request.jwt.claim.sub', :gina, false), set_config('request.jwt.claim.email', 'gina@x.ch', false) \gset
select test.ok('Zugewiesene Person erhält bei der Folge-Pendenz keine neue Zuweisungs-Mitteilung',
  (select count(*) from public.notifications where kind = 'assigned' and task_id = :'clone') = 0);
select set_config('request.jwt.claim.sub', :fabio, false), set_config('request.jwt.claim.email', 'fabio@x.ch', false) \gset

-- Rückgängig
select public.undo_recurring_completion(:'t', :'clone', 'FREQ=WEEKLY', 'fixed', null);
select test.ok('Rückgängig löscht die Folge-Pendenz samt Kopien',
  (select count(*) from public.tasks where id = :'clone') = 0
  and (select count(*) from public.subtasks where task_id = :'clone') = 0);
select test.ok('Rückgängig öffnet das Original wieder mit Wiederholung',
  (select status = 'open' and rrule = 'FREQ=WEEKLY' and completed_at is null from public.tasks where id = :'t'));
select test.ok('Rückgängig nur für zusammengehörige Pendenzen',
  test.throws(format($q$select public.undo_recurring_completion(%L, %L, null, 'fixed', null)$q$, :'t', :'once')));

-- «nach Erledigung»
insert into public.tasks (list_id, title, due_at, repeat_mode, repeat_after_days)
values (:'list', 'Pflanzen giessen', '2026-11-05 10:00+00', 'after_completion', 3) returning id as p \gset
select public.complete_recurring_task(:'p', '2026-11-08 10:00+00') as p2 \gset
select test.ok('Auch «x Tage nach Erledigung» erzeugt die Folge-Pendenz',
  (select repeat_mode = 'after_completion' and repeat_after_days = 3 from public.tasks where id = :'p2'));

-- Rechte
select public.create_invite(:'list', 'viewer') as vtok \gset
reset role;
update public.list_members set role = 'viewer' where list_id = :'list' and user_id = :gina;
set role authenticated;
select set_config('request.jwt.claim.sub', :gina, false), set_config('request.jwt.claim.email', 'gina@x.ch', false) \gset
select test.ok('Leser dürfen keine wiederkehrende Pendenz abschliessen',
  test.throws(format($q$select public.complete_recurring_task(%L, now())$q$, :'p2')));
reset role;
set role anon;
select test.ok('Anonym nicht', test.throws($q$select public.complete_recurring_task(gen_random_uuid(), now())$q$));
reset role;
