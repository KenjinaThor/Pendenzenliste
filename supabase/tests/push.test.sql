-- Tests für Erinnerungen, Tageszusammenfassung, Push-Abholung und Konfiguration.
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0000-0000-0000-00000000000d', 'dora@x.ch', '{"full_name":"Dora"}'),
  ('eeeeeeee-0000-0000-0000-00000000000e', 'emil@x.ch', '{"full_name":"Emil"}');
\set dora '\'dddddddd-0000-0000-0000-00000000000d\''
\set emil '\'eeeeeeee-0000-0000-0000-00000000000e\''

-- ====================================================== Versandzeitpunkt
select test.ok('Ganztägig: 09:00 Ortszeit am Fälligkeitstag (Winterzeit = 08:00 UTC)',
  public.compute_fire_at(null, 0, '2026-12-09 23:00+00', true, 'Europe/Zurich') = '2026-12-10 08:00+00');
select test.ok('Ganztägig: 1 Tag vorher',
  public.compute_fire_at(null, 1440, '2026-12-09 23:00+00', true, 'Europe/Zurich') = '2026-12-09 08:00+00');
select test.ok('Ganztägig im Sommer: 09:00 = 07:00 UTC',
  public.compute_fire_at(null, 0, '2026-06-30 22:00+00', true, 'Europe/Zurich') = '2026-07-01 07:00+00');
select test.ok('Mit Uhrzeit: Vorlaufzeit abziehen',
  public.compute_fire_at(null, 15, '2026-12-10 13:30+00', false, 'Europe/Zurich') = '2026-12-10 13:15+00');
select test.ok('Fester Zeitpunkt hat Vorrang',
  public.compute_fire_at('2026-12-01 10:00+00', 15, '2026-12-10 13:30+00', false, 'Europe/Zurich') = '2026-12-01 10:00+00');
select test.ok('Ohne Fälligkeit kein Versandzeitpunkt',
  public.compute_fire_at(null, 15, null, false, 'Europe/Zurich') is null);
select test.ok('Zeitzonen werden geprüft',
  public.is_valid_timezone('Europe/Zurich') and not public.is_valid_timezone('Mars/Olympus'));

set role authenticated;
select set_config('request.jwt.claim.sub', :dora, false), set_config('request.jwt.claim.email', 'dora@x.ch', false) \gset
select test.ok('Ungültige Zeitzone wird abgelehnt',
  test.throws(format($q$update public.profiles set timezone = 'Mars/Olympus' where id = %L$q$, :dora)));
insert into public.lists (name) values ('Arbeit') returning id as list \gset

-- ====================================================== Erinnerungen anlegen und neu berechnen
insert into public.tasks (list_id, title, due_at, due_all_day)
values (:'list', 'Ganztägig', '2026-12-09 23:00+00', true) returning id as t_all \gset
insert into public.reminders (task_id, offset_min) values (:'t_all', 1440) returning id as r_all \gset
select test.ok('Trigger berechnet fire_at beim Anlegen',
  (select fire_at from public.reminders where id = :'r_all') = '2026-12-09 08:00+00');
update public.tasks set due_at = '2026-12-10 23:00+00' where id = :'t_all';
select test.ok('Fälligkeit verschoben → fire_at wird neu berechnet',
  (select fire_at from public.reminders where id = :'r_all') = '2026-12-10 08:00+00');
update public.profiles set timezone = 'America/New_York' where id = :dora;
select test.ok('Zeitzone geändert → fire_at wird neu berechnet',
  (select fire_at from public.reminders where id = :'r_all') <> '2026-12-10 08:00+00');
update public.profiles set timezone = 'Europe/Zurich' where id = :dora;
select test.ok('Zeitzone zurück → ursprünglicher Wert',
  (select fire_at from public.reminders where id = :'r_all') = '2026-12-10 08:00+00');

select set_config('request.jwt.claim.sub', :emil, false), set_config('request.jwt.claim.email', 'emil@x.ch', false) \gset
select test.ok('Fremde sehen keine Erinnerungen', (select count(*) from public.reminders) = 0);
select test.ok('Fremde können keine Erinnerung auf fremde Pendenz anlegen',
  test.throws(format($q$insert into public.reminders (task_id, offset_min) values (%L, 0)$q$, :'t_all')));

-- ====================================================== Abholen fälliger Erinnerungen
select set_config('request.jwt.claim.sub', :dora, false), set_config('request.jwt.claim.email', 'dora@x.ch', false) \gset
-- fällig: Termin in 10 Minuten, 15 Minuten vorher erinnern → fire_at vor 5 Minuten
insert into public.tasks (list_id, title, due_at) values (:'list', 'Bald', now() + interval '10 minutes') returning id as t_soon \gset
insert into public.reminders (task_id, offset_min) values (:'t_soon', 15);
-- erledigt → wird still übersprungen
insert into public.tasks (list_id, title, due_at, status) values (:'list', 'Schon erledigt', now() + interval '10 minutes', 'done') returning id as t_done \gset
insert into public.reminders (task_id, offset_min) values (:'t_done', 15);
-- viel zu alt (ein Tag überfällig) → wird still übersprungen
insert into public.tasks (list_id, title, due_at) values (:'list', 'Uralt', now() - interval '1 day') returning id as t_old \gset
insert into public.reminders (task_id, offset_min) values (:'t_old', 0);
-- Zukunft → noch nicht
insert into public.tasks (list_id, title, due_at) values (:'list', 'Später', now() + interval '3 days') returning id as t_later \gset
insert into public.reminders (task_id, offset_min) values (:'t_later', 15);

select test.ok('Benutzer dürfen nicht abholen', test.throws($q$select * from public.claim_due_reminders()$q$));
reset role;
select count(*) as n, min(title) as t from public.claim_due_reminders() \gset claimed_
select test.ok('Genau die fällige Erinnerung wird abgeholt', :claimed_n = 1 and :'claimed_t' = 'Bald');
select test.ok('Übersprungene sind als gesendet markiert, zukünftige nicht',
  (select count(*) from public.reminders where sent_at is null and task_id in (:'t_done'::uuid, :'t_old'::uuid)) = 0
  and (select count(*) from public.reminders where sent_at is null and task_id = :'t_later') = 1);
select test.ok('Zweiter Abruf liefert nichts (höchstens einmal)', (select count(*) from public.claim_due_reminders()) = 0);

-- ====================================================== Mitteilungen als Push
set role authenticated;
select set_config('request.jwt.claim.sub', :dora, false), set_config('request.jwt.claim.email', 'dora@x.ch', false) \gset
select public.send_test_notification();
reset role;
select test.ok('Test-Mitteilung wird abgeholt', (select count(*) from public.claim_push_notifications() where kind = 'test') = 1);
select test.ok('Danach nichts mehr', (select count(*) from public.claim_push_notifications()) = 0);

-- ====================================================== Tageszusammenfassung
-- Ganztägig heute fällig (lokaler Mitternacht in Zürich), einmal überfällig
insert into public.tasks (list_id, title, due_at, due_all_day) values
  (:'list', 'Heute A', ((now() at time zone 'Europe/Zurich')::date)::timestamp at time zone 'Europe/Zurich', true),
  (:'list', 'Heute B', ((now() at time zone 'Europe/Zurich')::date)::timestamp at time zone 'Europe/Zurich' + interval '10 hours', false),
  (:'list', 'Gestern', (((now() at time zone 'Europe/Zurich')::date) - 1)::timestamp at time zone 'Europe/Zurich', true);
select test.ok('Ohne gewählte Uhrzeit keine Zusammenfassung', (select count(*) from public.claim_due_digests()) = 0);
update public.profiles set daily_digest_time = '00:00' where id = :dora;
update public.profiles set daily_digest_time = '23:59:59' where id = :emil;
select count(*) as n, min(due_today) as d, min(overdue) as o from public.claim_due_digests() \gset digest_
select test.ok('Zusammenfassung zählt fällige und überfällige Pendenzen (ab 00:00 fällig)',
  :digest_n = 1 and :digest_d >= 2 and :digest_o >= 1);
select test.ok('Pro Tag nur einmal', (select count(*) from public.claim_due_digests()) = 0);
select test.ok('Uhrzeit noch nicht erreicht oder nichts fällig → keine Zusammenfassung',
  (select last_digest_date from public.profiles where id = :emil) is null);

-- ====================================================== Konfiguration und Aufräumen
set role authenticated;
select set_config('request.jwt.claim.sub', :dora, false), set_config('request.jwt.claim.email', 'dora@x.ch', false) \gset
select test.ok('Konfiguration ist für Benutzer unsichtbar', test.throws($q$select * from public.app_config$q$));
select test.ok('configure_push ist für Benutzer gesperrt', test.throws($q$select public.configure_push('https://x.supabase.co')$q$));
select test.ok('Öffentlicher VAPID-Schlüssel ist abrufbar (noch leer)', public.get_vapid_public_key() is null);
reset role;
insert into public.app_config (key, value) values ('vapid_public_key', 'PUB');
set role authenticated;
select set_config('request.jwt.claim.sub', :dora, false), set_config('request.jwt.claim.email', 'dora@x.ch', false) \gset
select test.ok('VAPID-Schlüssel wird ausgeliefert', public.get_vapid_public_key() = 'PUB');
select test.ok('Private Daten (cron_secret) sind nicht erreichbar', test.throws($q$select value from public.app_config where key = 'cron_secret'$q$));
reset role;
select public.configure_push('https://abc.supabase.co/');
select test.ok('configure_push speichert die Funktions-Adresse',
  (select value from public.app_config where key = 'function_url') = 'https://abc.supabase.co/functions/v1/send-reminders');

-- Papierkorb: nach 30 Tagen endgültig löschen
insert into public.tasks (list_id, title, deleted_at) values (:'list', 'Alt im Papierkorb', now() - interval '31 days'),
  (:'list', 'Frisch im Papierkorb', now() - interval '2 days');
select public.purge_old_data();
select test.ok('Aufräumen löscht nur Alte',
  (select count(*) from public.tasks where title = 'Alt im Papierkorb') = 0
  and (select count(*) from public.tasks where title = 'Frisch im Papierkorb') = 1);
