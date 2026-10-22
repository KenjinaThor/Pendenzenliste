-- Automatische Tests der Zugriffsregeln (RLS), Trigger und Funktionen.
-- Ausführung: siehe supabase/tests/run.sh. Jeder fehlgeschlagene Test bricht mit einer Fehlermeldung ab.
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'anna@x.ch', '{"full_name":"Anna"}'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'ben@x.ch', '{}'),
  ('cccccccc-0000-0000-0000-00000000000c', 'cleo@x.ch', '{"name":"Cleo"}');
\set anna '\'aaaaaaaa-0000-0000-0000-00000000000a\''
\set ben '\'bbbbbbbb-0000-0000-0000-00000000000b\''
\set cleo '\'cccccccc-0000-0000-0000-00000000000c\''

select test.ok('Profil wird bei der Anmeldung angelegt (Name aus Google)',
  (select name from public.profiles where id = :anna) = 'Anna');
select test.ok('Profilname fällt auf die E-Mail zurück',
  (select name from public.profiles where id = :ben) = 'ben');

-- ====================================================== Anna legt Liste und Pendenz an
set role authenticated;
select set_config('request.jwt.claim.sub', :anna, false), set_config('request.jwt.claim.email', 'anna@x.ch', false) \gset
insert into public.lists (name) values ('Haushalt') returning id as list \gset
insert into public.tasks (list_id, title) values (:'list', 'Einkaufen') returning id as task \gset
select test.ok('Besitzerin ist automatisch Mitglied mit Rolle owner',
  (select role from public.list_members where list_id = :'list' and user_id = :anna) = 'owner');

-- ====================================================== Fremde Person (Cleo) sieht nichts
select set_config('request.jwt.claim.sub', :cleo, false), set_config('request.jwt.claim.email', 'cleo@x.ch', false) \gset
select test.ok('Fremde sieht keine Listen', (select count(*) from public.lists) = 0);
select test.ok('Fremde sieht keine Pendenzen', (select count(*) from public.tasks) = 0);
select test.ok('Fremde sieht keine Profile anderer', (select count(*) from public.profiles) = 1);
select test.ok('Fremde kann keine Pendenz in fremde Liste legen',
  test.throws(format($q$insert into public.tasks (list_id, title) values (%L, 'Hack')$q$, :'list')));
select test.ok('Fremde kann nicht einladen',
  test.throws(format($q$select public.create_invite(%L)$q$, :'list')));
select test.ok('Ungültige Einladung wird abgelehnt', test.throws($q$select public.accept_invite('falsch')$q$));
select test.ok('Fremde kann sich nicht selbst hinzufügen',
  test.throws(format($q$insert into public.list_members (list_id, user_id, role) values (%L, %L, 'editor')$q$, :'list', :cleo)));

-- ====================================================== Einladung per E-Mail (Ben)
select set_config('request.jwt.claim.sub', :anna, false), set_config('request.jwt.claim.email', 'anna@x.ch', false) \gset
select public.create_invite(:'list', 'editor', 'Ben@x.ch') as mail_token \gset
select test.ok('Einladung speichert nur den Hash',
  (select count(*) from public.list_invites where token_hash = :'mail_token') = 0);

select set_config('request.jwt.claim.sub', :ben, false), set_config('request.jwt.claim.email', 'ben@x.ch', false) \gset
select test.ok('E-Mail-Einladung wird automatisch angenommen (unabhängig von Gross-/Kleinschreibung)',
  public.claim_email_invites() = 1);
select test.ok('Ben sieht Liste und Pendenz', (select count(*) from public.lists) = 1 and (select count(*) from public.tasks) = 1);
select test.ok('Ben sieht Annas Profil', (select count(*) from public.profiles where id = :anna) = 1);
select test.ok('Bearbeiter darf Pendenz anlegen',
  test.rows(format($q$insert into public.tasks (list_id, title) values (%L, 'Waschen')$q$, :'list')) = 1);
select test.ok('Bearbeiter darf Liste nicht umbenennen',
  test.rows(format($q$update public.lists set name = 'X' where id = %L$q$, :'list')) = 0);
select test.ok('Bearbeiter darf nicht einladen',
  test.throws(format($q$select public.create_invite(%L)$q$, :'list')));
select test.ok('Bearbeiter darf keine Mitglieder hinzufügen',
  test.throws(format($q$insert into public.list_members (list_id, user_id, role) values (%L, %L, 'viewer')$q$, :'list', :cleo)));
select test.ok('Einladung kann nicht zweimal angenommen werden', public.claim_email_invites() = 0);

-- ====================================================== Zuweisung und Benachrichtigung
select set_config('request.jwt.claim.sub', :anna, false), set_config('request.jwt.claim.email', 'anna@x.ch', false) \gset
update public.tasks set assignee_id = :ben where id = :'task';
select test.ok('Zuweisung an Nicht-Mitglied wird abgelehnt',
  test.throws(format($q$update public.tasks set assignee_id = %L where id = %L$q$, :cleo, :'task')));
select set_config('request.jwt.claim.sub', :ben, false), set_config('request.jwt.claim.email', 'ben@x.ch', false) \gset
select test.ok('Ben erhält eine Benachrichtigung zur Zuweisung',
  (select count(*) from public.notifications where kind = 'assigned' and task_id = :'task') = 1);
select test.ok('Aktivitätsverlauf zeigt die Zuweisung',
  (select count(*) from public.activity_log where task_id = :'task' and diff ? 'assignee_id') = 1);

-- ====================================================== Kommentar mit Erwähnung
insert into public.comments (task_id, body, mentions) values (:'task', 'Kannst du das übernehmen @Anna?', array[:anna::uuid, :cleo::uuid]);
select set_config('request.jwt.claim.sub', :anna, false), set_config('request.jwt.claim.email', 'anna@x.ch', false) \gset
select test.ok('Anna wird über die Erwähnung benachrichtigt',
  (select count(*) from public.notifications where kind = 'mention' and task_id = :'task') = 1);
select test.ok('Kommentar steht im Verlauf', (select count(*) from public.activity_log where task_id = :'task' and action = 'commented') = 1);
select set_config('request.jwt.claim.sub', :cleo, false), set_config('request.jwt.claim.email', 'cleo@x.ch', false) \gset
select test.ok('Nicht-Mitglieder werden bei Erwähnung nicht benachrichtigt und sehen keine Kommentare',
  (select count(*) from public.notifications) = 0 and (select count(*) from public.comments) = 0);

-- ====================================================== Rolle «Leser»
select set_config('request.jwt.claim.sub', :anna, false), set_config('request.jwt.claim.email', 'anna@x.ch', false) \gset
update public.list_members set role = 'viewer' where list_id = :'list' and user_id = :ben;
select test.ok('Besitzerin darf Rollen ändern', (select role from public.list_members where user_id = :ben and list_id = :'list') = 'viewer');
select test.ok('Rolle owner kann nicht vergeben werden',
  test.throws(format($q$update public.list_members set role = 'owner' where list_id = %L and user_id = %L$q$, :'list', :ben)));
select set_config('request.jwt.claim.sub', :ben, false), set_config('request.jwt.claim.email', 'ben@x.ch', false) \gset
select test.ok('Leser sieht Pendenzen', (select count(*) from public.tasks) = 2);
select test.ok('Leser darf nichts anlegen',
  test.throws(format($q$insert into public.tasks (list_id, title) values (%L, 'Nein')$q$, :'list')));
select test.ok('Leser darf nichts ändern',
  test.rows(format($q$update public.tasks set title = 'Nein' where id = %L$q$, :'task')) = 0);
select test.ok('Leser darf nicht kommentieren',
  test.throws(format($q$insert into public.comments (task_id, body) values (%L, 'hm')$q$, :'task')));

-- ====================================================== Einladungslink (Cleo)
select set_config('request.jwt.claim.sub', :anna, false), set_config('request.jwt.claim.email', 'anna@x.ch', false) \gset
select public.create_invite(:'list', 'viewer') as link_token \gset
select set_config('request.jwt.claim.sub', :cleo, false), set_config('request.jwt.claim.email', 'cleo@x.ch', false) \gset
select test.ok('Einladungslink gibt Zugriff', public.accept_invite(:'link_token') = :'list'::uuid);
select test.ok('Cleo sieht jetzt die Liste', (select count(*) from public.lists) = 1);
select test.ok('Link kann nur einmal verwendet werden', test.throws(format($q$select public.accept_invite(%L)$q$, :'link_token')));

-- ====================================================== Zuweisung freigeben, Mitglied entfernen, Verlassen
select set_config('request.jwt.claim.sub', :anna, false), set_config('request.jwt.claim.email', 'anna@x.ch', false) \gset
update public.list_members set role = 'editor' where list_id = :'list' and user_id = :ben;
delete from public.list_members where list_id = :'list' and user_id = :ben;
select test.ok('Entferntes Mitglied gibt Zuweisung frei', (select assignee_id from public.tasks where id = :'task') is null);
select test.ok('Besitzerin kann nicht entfernt werden',
  test.rows(format($q$delete from public.list_members where list_id = %L and user_id = %L$q$, :'list', :anna)) = 0);
select set_config('request.jwt.claim.sub', :cleo, false), set_config('request.jwt.claim.email', 'cleo@x.ch', false) \gset
select test.ok('Mitglied kann die Liste verlassen',
  test.rows(format($q$delete from public.list_members where list_id = %L and user_id = %L$q$, :'list', :cleo)) = 1);
select test.ok('Danach kein Zugriff mehr', (select count(*) from public.tasks) = 0);

-- ====================================================== Kalender-Token und anonymer Zugriff
select set_config('request.jwt.claim.sub', :anna, false), set_config('request.jwt.claim.email', 'anna@x.ch', false) \gset
select public.rotate_calendar_token() as cal \gset
select test.ok('Token hat 64 Zeichen', length(:'cal') = 64);
select set_config('request.jwt.claim.sub', :ben, false), set_config('request.jwt.claim.email', 'ben@x.ch', false) \gset
select test.ok('Andere sehen den Kalender-Token nicht', (select count(*) from public.calendar_tokens) = 0);
reset role;
set role anon;
select test.ok('Anonym hat keinen Zugriff auf Pendenzen', test.throws($q$select * from public.tasks$q$));
select test.ok('Anonym darf keine Funktionen aufrufen', test.throws($q$select public.rotate_calendar_token()$q$));
reset role;

-- ====================================================== Liste löschen und Konto löschen
set role authenticated;
select set_config('request.jwt.claim.sub', :anna, false), set_config('request.jwt.claim.email', 'anna@x.ch', false) \gset
select public.create_invite(:'list', 'editor', 'ben@x.ch') as t2 \gset
select set_config('request.jwt.claim.sub', :ben, false), set_config('request.jwt.claim.email', 'ben@x.ch', false) \gset
select public.claim_email_invites();
select set_config('request.jwt.claim.sub', :anna, false), set_config('request.jwt.claim.email', 'anna@x.ch', false) \gset
update public.tasks set assignee_id = :ben where id = :'task';
select test.ok('Liste mit Mitgliedern und Zuweisungen lässt sich löschen',
  test.rows(format($q$delete from public.lists where id = %L$q$, :'list')) = 1);
select test.ok('Danach sind Pendenzen und Verlauf weg',
  (select count(*) from public.tasks) = 0 and (select count(*) from public.activity_log) = 0);

select set_config('request.jwt.claim.sub', :ben, false), set_config('request.jwt.claim.email', 'ben@x.ch', false) \gset
insert into public.lists (name) values ('Bens Liste');
select public.delete_my_account();
reset role;
select test.ok('Konto löschen entfernt Benutzer, Profil und eigene Listen',
  (select count(*) from auth.users where id = :ben) = 0
  and (select count(*) from public.profiles where id = :ben) = 0
  and (select count(*) from public.lists where name = 'Bens Liste') = 0);
