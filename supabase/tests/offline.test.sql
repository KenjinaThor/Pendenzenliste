-- Tests: Offline-Synchronisierung (neuester Zeitstempel gewinnt pro Feld) und Dateianhänge
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1111111-0000-0000-0000-000000000001', 'olga@x.ch', '{"full_name":"Olga"}'),
  ('a2222222-0000-0000-0000-000000000002', 'paul@x.ch', '{"full_name":"Paul"}'),
  ('a3333333-0000-0000-0000-000000000003', 'quin@x.ch', '{"full_name":"Quin"}');
\set olga '\'a1111111-0000-0000-0000-000000000001\''
\set paul '\'a2222222-0000-0000-0000-000000000002\''
\set quin '\'a3333333-0000-0000-0000-000000000003\''

set role authenticated;
select set_config('request.jwt.claim.sub', :olga, false), set_config('request.jwt.claim.email', 'olga@x.ch', false) \gset
insert into public.lists (name) values ('Familie') returning id as list \gset
insert into public.lists (name) values ('Zweite') returning id as list2 \gset
select public.create_invite(:'list', 'editor', 'paul@x.ch');
insert into public.tasks (list_id, title, priority) values (:'list', 'Original', 'medium') returning id as t \gset

select set_config('request.jwt.claim.sub', :paul, false), set_config('request.jwt.claim.email', 'paul@x.ch', false) \gset
select public.claim_email_invites();

-- ====================================================== neuester Zeitstempel gewinnt pro Feld
select set_config('request.jwt.claim.sub', :olga, false), set_config('request.jwt.claim.email', 'olga@x.ch', false) \gset
-- Olga ändert um 10:00 Titel und Priorität
select public.update_task_fields(:'t', '{"title":"Olgas Titel","priority":"high"}', '2026-11-01 10:00+00');
select test.ok('Änderung wird angewendet',
  (select title = 'Olgas Titel' and priority = 'high' from public.tasks where id = :'t'));

-- Paul war offline und hat um 09:00 den Titel (älter!) und um 11:00 die Notizen geändert; synchronisiert erst jetzt
select set_config('request.jwt.claim.sub', :paul, false), set_config('request.jwt.claim.email', 'paul@x.ch', false) \gset
select public.update_task_fields(:'t', '{"title":"Pauls alter Titel"}', '2026-11-01 09:00+00');
select test.ok('Ältere Änderung am selben Feld verliert', (select title from public.tasks where id = :'t') = 'Olgas Titel');
select public.update_task_fields(:'t', '{"title":"Pauls neuer Titel","notes_md":"Notiz von Paul"}', '2026-11-01 11:00+00');
select test.ok('Neuere Änderung gewinnt, andere Felder bleiben unberührt',
  (select title = 'Pauls neuer Titel' and notes_md = 'Notiz von Paul' and priority = 'high' from public.tasks where id = :'t'));

-- gemischt: ein Feld älter, ein Feld neuer
select public.update_task_fields(:'t', '{"priority":"low","status":"in_progress"}', '2026-11-01 10:30+00');
select test.ok('Pro Feld entschieden: Priorität (von 10:00) wird überschrieben, Titel (11:00) nicht angefasst',
  (select priority = 'low' and status = 'in_progress' and title = 'Pauls neuer Titel' from public.tasks where id = :'t'));
select public.update_task_fields(:'t', '{"priority":"high"}', '2026-11-01 10:15+00');
select test.ok('Zwischenzeitlich überholte Änderung (10:15 < 10:30) wird verworfen',
  (select priority from public.tasks where id = :'t') = 'low');
select test.ok('Zeitstempel werden pro Feld gespeichert',
  (select (field_updated_at ->> 'priority')::timestamptz = '2026-11-01 10:30+00'
      and (field_updated_at ->> 'title')::timestamptz = '2026-11-01 11:00+00' from public.tasks where id = :'t'));

-- gleicher Zeitstempel: die spätere Anfrage gewinnt (gleichzeitig = egal, aber kein Fehler)
select public.update_task_fields(:'t', '{"title":"Gleichzeitig"}', '2026-11-01 11:00+00');
select test.ok('Gleicher Zeitstempel wird angewendet', (select title from public.tasks where id = :'t') = 'Gleichzeitig');

-- ====================================================== Typen, Whitelist, Rechte
select public.update_task_fields(:'t', '{"due_at":"2026-12-24T08:00:00Z","due_all_day":false,"duration_min":45,"rrule":"FREQ=WEEKLY","focus_date":"2026-12-24","deleted_at":null}', '2026-11-02 08:00+00');
select test.ok('Datums-, Zahlen- und Textfelder werden typgerecht übernommen',
  (select due_at = '2026-12-24 08:00+00' and not due_all_day and duration_min = 45 and rrule = 'FREQ=WEEKLY'
          and focus_date = '2026-12-24' and deleted_at is null from public.tasks where id = :'t'));
select public.update_task_fields(:'t', '{"created_by":"a3333333-0000-0000-0000-000000000003","id":"a3333333-0000-0000-0000-000000000003","fts":"x"}', '2026-11-03 08:00+00');
select test.ok('Nicht erlaubte Felder werden ignoriert',
  (select created_by = :olga::uuid and id = :'t'::uuid from public.tasks where id = :'t'));
select public.update_task_fields(:'t', '{"deleted_at":"2026-11-04T08:00:00Z"}', '2026-11-04 08:00+00');
select test.ok('In den Papierkorb verschieben geht über dieselbe Funktion', (select deleted_at is not null from public.tasks where id = :'t'));
select public.update_task_fields(:'t', '{"deleted_at":null}', '2026-11-04 09:00+00');

select test.ok('Zuweisung an Nichtmitglied wird weiterhin abgelehnt',
  test.throws(format($q$select public.update_task_fields(%L, '{"assignee_id":"a3333333-0000-0000-0000-000000000003"}', now())$q$, :'t')));
select test.ok('Verschieben in eine fremde Liste wird abgelehnt',
  test.throws(format($q$select public.update_task_fields(%L, jsonb_build_object('list_id', gen_random_uuid()), now())$q$, :'t')));

select set_config('request.jwt.claim.sub', :quin, false), set_config('request.jwt.claim.email', 'quin@x.ch', false) \gset
select test.ok('Fremde dürfen nichts ändern',
  test.throws(format($q$select public.update_task_fields(%L, '{"title":"Hack"}', now())$q$, :'t')));

reset role;
update public.list_members set role = 'viewer' where list_id = :'list' and user_id = :paul;
set role authenticated;
select set_config('request.jwt.claim.sub', :paul, false), set_config('request.jwt.claim.email', 'paul@x.ch', false) \gset
select test.ok('Leser dürfen nichts ändern',
  test.throws(format($q$select public.update_task_fields(%L, '{"title":"Nein"}', now())$q$, :'t')));
reset role;
set role anon;
select test.ok('Anonym nicht', test.throws(format($q$select public.update_task_fields(%L, '{"title":"x"}', now())$q$, :'t')));
reset role;

-- ====================================================== Dateianhänge (Storage-Richtlinien)
select test.ok('Bucket «attachments» ist privat und auf 5 MB begrenzt',
  (select not public and file_size_limit = 5242880 from storage.buckets where id = 'attachments'));

set role authenticated;
select set_config('request.jwt.claim.sub', :olga, false), set_config('request.jwt.claim.email', 'olga@x.ch', false) \gset
select format('%s/%s/foto.jpg', :'list', :'t') as path \gset
insert into storage.objects (bucket_id, name) values ('attachments', :'path');
select test.ok('Besitzerin darf in ihre Liste hochladen', (select count(*) from storage.objects) = 1);

select set_config('request.jwt.claim.sub', :quin, false), set_config('request.jwt.claim.email', 'quin@x.ch', false) \gset
select test.ok('Fremde sehen die Datei nicht', (select count(*) from storage.objects) = 0);
select test.ok('Fremde dürfen nicht hochladen',
  test.throws(format($q$insert into storage.objects (bucket_id, name) values ('attachments', %L)$q$, format('%s/x/y.pdf', :'list'))));

select set_config('request.jwt.claim.sub', :paul, false), set_config('request.jwt.claim.email', 'paul@x.ch', false) \gset
select test.ok('Leser sehen die Datei', (select count(*) from storage.objects) = 1);
select test.ok('Leser dürfen nicht hochladen',
  test.throws(format($q$insert into storage.objects (bucket_id, name) values ('attachments', %L)$q$, format('%s/x/z.pdf', :'list'))));
select test.ok('Leser dürfen nicht löschen', test.rows($q$delete from storage.objects where bucket_id = 'attachments'$q$) = 0);

select set_config('request.jwt.claim.sub', :olga, false), set_config('request.jwt.claim.email', 'olga@x.ch', false) \gset
select test.ok('Besitzerin darf löschen', test.rows($q$delete from storage.objects where bucket_id = 'attachments'$q$) = 1);
reset role;
