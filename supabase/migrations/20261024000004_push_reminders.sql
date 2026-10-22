-- Phase 7: Erinnerungen und Web-Push
--  * Versandzeitpunkt (fire_at) wird in der Datenbank aus Fälligkeit, Vorlaufzeit und Zeitzone berechnet
--  * SQL-Funktionen «claim_…» holen fällige Erinnerungen/Mitteilungen/Zusammenfassungen atomar ab
--    (jede wird höchstens einmal verschickt); der Versand selbst macht die Edge Function «send-reminders»
--  * pg_cron ruft die Edge Function jede Minute auf (falls pg_cron/pg_net verfügbar sind)

-- ---------------------------------------------------------------------------
-- Interne Konfiguration (nur für Datenbank und Edge Functions, nicht für App-Benutzer)
-- ---------------------------------------------------------------------------
create table public.app_config (
  key text primary key,
  value text not null
);
alter table public.app_config enable row level security; -- bewusst ohne Policies
revoke all on public.app_config from anon, authenticated;

-- geheimer Schlüssel, mit dem sich der Zeitplan gegenüber der Edge Function ausweist
insert into public.app_config (key, value)
values ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Spalten
-- ---------------------------------------------------------------------------
alter table public.notifications add column push_sent_at timestamptz;
update public.notifications set push_sent_at = now(); -- bestehende nicht nachträglich verschicken
alter table public.profiles add column last_digest_date date;

create function public.is_valid_timezone(p_name text) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_name);
$$;
alter table public.profiles
  add constraint profiles_timezone_valid check (public.is_valid_timezone(timezone));

-- ---------------------------------------------------------------------------
-- Versandzeitpunkt einer Erinnerung
-- ---------------------------------------------------------------------------
-- Ganztägige Pendenzen erinnern um 09:00 Uhr (Ortszeit) am Fälligkeitstag, abzüglich der Vorlaufzeit.
create function public.compute_fire_at(
  p_at timestamptz, p_offset int, p_due timestamptz, p_all_day boolean, p_tz text
) returns timestamptz language sql stable set search_path = '' as $$
  select case
    when p_at is not null then p_at
    when p_due is null or p_offset is null then null
    when p_all_day then
      (((p_due at time zone p_tz)::date + time '09:00') at time zone p_tz)
        - pg_catalog.make_interval(mins => p_offset)
    else p_due - pg_catalog.make_interval(mins => p_offset)
  end;
$$;

create function public.reminders_set_fire_at() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_due timestamptz; v_all_day boolean; v_tz text;
begin
  select t.due_at, t.due_all_day into v_due, v_all_day from public.tasks t where t.id = new.task_id;
  select p.timezone into v_tz from public.profiles p where p.id = new.user_id;
  new.fire_at := public.compute_fire_at(new.at, new.offset_min, v_due, coalesce(v_all_day, false),
                                        coalesce(v_tz, 'Europe/Zurich'));
  if tg_op = 'UPDATE' then new.sent_at := null; end if; -- geänderte Erinnerung darf erneut auslösen
  return new;
end $$;
create trigger reminders_fire_at before insert or update of offset_min, at on public.reminders
  for each row execute function public.reminders_set_fire_at();

-- Fälligkeit geändert → Versandzeitpunkte der Erinnerungen neu berechnen
create function public.refresh_reminders(p_task uuid, p_user uuid default null) returns void
language sql security definer set search_path = '' as $$
  update public.reminders r
  set fire_at = x.f,
      sent_at = case when x.f is distinct from r.fire_at then null else r.sent_at end
  from (
    select r2.id,
           public.compute_fire_at(r2.at, r2.offset_min, t.due_at, t.due_all_day,
                                  coalesce(p.timezone, 'Europe/Zurich')) as f
    from public.reminders r2
    join public.tasks t on t.id = r2.task_id
    left join public.profiles p on p.id = r2.user_id
    where (p_task is null or r2.task_id = p_task) and (p_user is null or r2.user_id = p_user)
  ) x
  where r.id = x.id;
$$;
revoke execute on function public.refresh_reminders(uuid, uuid) from public, anon, authenticated;

create function public.tasks_refresh_reminders() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_reminders(new.id);
  return new;
end $$;
create trigger tasks_reminders after update of due_at, due_all_day on public.tasks
  for each row execute function public.tasks_refresh_reminders();

create function public.profiles_refresh_reminders() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_reminders(null, new.id);
  return new;
end $$;
create trigger profiles_reminders after update of timezone on public.profiles
  for each row execute function public.profiles_refresh_reminders();

-- ---------------------------------------------------------------------------
-- Abholen fälliger Sendungen (nur für die Edge Function mit Service-Rolle)
-- ---------------------------------------------------------------------------
-- Fällige Erinnerungen. Erledigte/gelöschte Pendenzen und Erinnerungen, die älter als 2 Stunden sind
-- (z. B. nach einem Ausfall), werden still als gesendet markiert.
create function public.claim_due_reminders(p_limit int default 200)
returns table (
  reminder_id uuid, user_id uuid, task_id uuid, title text,
  due_at timestamptz, due_all_day boolean, timezone text
) language sql security definer set search_path = '' as $$
  with due as (
    select r.id from public.reminders r
    where r.sent_at is null and r.fire_at is not null and r.fire_at <= now()
    order by r.fire_at
    limit p_limit
    for update skip locked
  ), marked as (
    update public.reminders r set sent_at = now()
    from due where r.id = due.id
    returning r.id, r.user_id, r.task_id, r.fire_at
  )
  select m.id, m.user_id, m.task_id, t.title, t.due_at, t.due_all_day,
         coalesce(p.timezone, 'Europe/Zurich')
  from marked m
  join public.tasks t on t.id = m.task_id
  left join public.profiles p on p.id = m.user_id
  where t.deleted_at is null and t.status <> 'done' and m.fire_at > now() - interval '2 hours';
$$;

-- Neue Mitteilungen (Zuweisung, Erwähnung, Test), die noch nicht als Push verschickt wurden
create function public.claim_push_notifications(p_limit int default 200)
returns table (notification_id uuid, user_id uuid, kind text, task_id uuid, payload jsonb)
language sql security definer set search_path = '' as $$
  with due as (
    select n.id from public.notifications n
    where n.push_sent_at is null
    order by n.created_at
    limit p_limit
    for update skip locked
  ), marked as (
    update public.notifications n set push_sent_at = now()
    from due where n.id = due.id
    returning n.id, n.user_id, n.kind, n.task_id, n.payload, n.created_at
  )
  select m.id, m.user_id, m.kind, m.task_id, m.payload
  from marked m
  where m.created_at > now() - interval '1 day';
$$;

-- Tageszusammenfassungen: Wer ab der gewählten Uhrzeit (Ortszeit) noch keine hatte, bekommt eine –
-- sofern etwas fällig oder überfällig ist.
create function public.claim_due_digests()
returns table (user_id uuid, due_today int, overdue int, timezone text)
language sql security definer set search_path = '' as $$
  with eligible as (
    select p.id, coalesce(p.timezone, 'Europe/Zurich') as tz,
           (now() at time zone coalesce(p.timezone, 'Europe/Zurich'))::date as local_date
    from public.profiles p
    where p.daily_digest_time is not null
      and (now() at time zone coalesce(p.timezone, 'Europe/Zurich'))::time >= p.daily_digest_time
      and p.last_digest_date is distinct from
          (now() at time zone coalesce(p.timezone, 'Europe/Zurich'))::date
    for update skip locked
  ), marked as (
    update public.profiles p set last_digest_date = e.local_date
    from eligible e where p.id = e.id
    returning p.id
  ), counted as (
    select e.id, e.tz,
      (select count(*)::int from public.tasks t
        join public.list_members m on m.list_id = t.list_id and m.user_id = e.id
        where t.deleted_at is null and t.status <> 'done' and t.due_at is not null
          and (t.assignee_id is null or t.assignee_id = e.id)
          and (t.due_at at time zone e.tz)::date = e.local_date) as due_today,
      (select count(*)::int from public.tasks t
        join public.list_members m on m.list_id = t.list_id and m.user_id = e.id
        where t.deleted_at is null and t.status <> 'done' and t.due_at is not null
          and (t.assignee_id is null or t.assignee_id = e.id)
          and (t.due_at at time zone e.tz)::date < e.local_date) as overdue
    from eligible e join marked mk on mk.id = e.id
  )
  select c.id, c.due_today, c.overdue, c.tz from counted c where c.due_today > 0 or c.overdue > 0;
$$;

revoke execute on function
  public.claim_due_reminders(int), public.claim_push_notifications(int), public.claim_due_digests()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Konfiguration und Hilfsfunktionen für die App
-- ---------------------------------------------------------------------------
-- Öffentlicher VAPID-Schlüssel (wird von der Edge Function beim ersten Lauf erzeugt)
create function public.get_vapid_public_key() returns text
language sql stable security definer set search_path = '' as $$
  select value from public.app_config where key = 'vapid_public_key';
$$;
revoke execute on function public.get_vapid_public_key() from public, anon;
grant execute on function public.get_vapid_public_key() to authenticated;

-- Einmalig im SQL Editor aufrufen: select public.configure_push('https://<projekt>.supabase.co');
create function public.configure_push(p_base_url text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.app_config (key, value)
  values ('function_url', rtrim(p_base_url, '/') || '/functions/v1/send-reminders')
  on conflict (key) do update set value = excluded.value;
end $$;
revoke execute on function public.configure_push(text) from public, anon, authenticated;

-- Test-Mitteilung an sich selbst (kommt innerhalb einer Minute als Push an)
create function public.send_test_notification() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  insert into public.notifications (user_id, kind, payload)
  values (auth.uid(), 'test', jsonb_build_object('actor_name', 'Pendenzen'));
end $$;
revoke execute on function public.send_test_notification() from public, anon;
grant execute on function public.send_test_notification() to authenticated;

-- Aufräumen: Papierkorb nach 30 Tagen leeren, alte Mitteilungen und Einladungen löschen
create function public.purge_old_data() returns void
language sql security definer set search_path = '' as $$
  delete from public.tasks where deleted_at < now() - interval '30 days';
  delete from public.notifications where created_at < now() - interval '90 days';
  delete from public.list_invites where expires_at < now() - interval '30 days';
$$;
revoke execute on function public.purge_old_data() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Zeitplan (pg_cron + pg_net). Fehlen die Erweiterungen, wird das mit einem Hinweis übersprungen.
-- ---------------------------------------------------------------------------
create function public.invoke_send_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select value into v_url from public.app_config where key = 'function_url';
  select value into v_secret from public.app_config where key = 'cron_secret';
  if v_url is null or v_secret is null then return; end if; -- noch nicht konfiguriert
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end $$;
revoke execute on function public.invoke_send_reminders() from public, anon, authenticated;

do $$
begin
  begin
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_cron/pg_net konnten nicht aktiviert werden (%). Bitte unter Integrations aktivieren.', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('send-reminders', '* * * * *', 'select public.invoke_send_reminders()');
    perform cron.schedule('purge-old-data', '17 3 * * *', 'select public.purge_old_data()');
  else
    raise notice 'pg_cron ist nicht verfügbar – Zeitplan nicht eingerichtet.';
  end if;
end $$;
