-- Kernschema für «Pendenzen»: Tabellen, Hilfsfunktionen, Trigger und Row Level Security.
-- Alle Tabellen sind per RLS geschützt: Jede Person sieht nur eigene und mit ihr geteilte Daten.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Typen
-- ---------------------------------------------------------------------------
-- Reihenfolge ist relevant: viewer < editor < owner (Vergleich mit >=)
create type public.list_role as enum ('viewer', 'editor', 'owner');
create type public.task_priority as enum ('low', 'medium', 'high');
create type public.task_status as enum ('open', 'in_progress', 'waiting', 'done');
create type public.repeat_mode as enum ('fixed', 'after_completion');

-- ---------------------------------------------------------------------------
-- Allgemeine Trigger-Funktion: updated_at pflegen
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profile (1:1 zu auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text not null default '',
  avatar_url text,
  timezone text not null default 'Europe/Zurich',
  canton text not null default 'SG',
  daily_digest_time time,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Profil automatisch beim ersten Login anlegen (Name/Bild von Google übernehmen)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name',
             split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Ordner, Listen, Mitglieder, Einladungen
-- ---------------------------------------------------------------------------
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 80),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger folders_updated_at before update on public.folders
  for each row execute function public.set_updated_at();

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  folder_id uuid references public.folders (id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default '#6366f1',
  emoji text not null default '📋',
  position int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lists_owner_idx on public.lists (owner_id);
create trigger lists_updated_at before update on public.lists
  for each row execute function public.set_updated_at();

create table public.list_members (
  list_id uuid not null references public.lists (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.list_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index list_members_user_idx on public.list_members (user_id);

create table public.list_invites (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  email text,
  role public.list_role not null default 'editor' check (role <> 'owner'),
  token_hash text not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index list_invites_list_idx on public.list_invites (list_id);
create index list_invites_email_idx on public.list_invites (lower(email));

-- Besitzer wird automatisch Mitglied mit Rolle «owner»
create function public.add_list_owner_as_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.list_members (list_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger lists_add_owner after insert on public.lists
  for each row execute function public.add_list_owner_as_member();

-- ---------------------------------------------------------------------------
-- Zugriffs-Hilfsfunktionen (security definer, damit RLS-Policies nicht rekursiv werden)
-- ---------------------------------------------------------------------------
create function public.is_list_member(p_list uuid, p_min public.list_role default 'viewer')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.list_members m
    where m.list_id = p_list and m.user_id = auth.uid() and m.role >= p_min
  );
$$;

create function public.shares_list_with(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid() or exists (
    select 1 from public.list_members a
    join public.list_members b on b.list_id = a.list_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- ---------------------------------------------------------------------------
-- Pendenzen
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  notes_md text not null default '',
  due_at timestamptz,
  due_all_day boolean not null default false,
  duration_min int check (duration_min is null or duration_min > 0),
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'open',
  assignee_id uuid references public.profiles (id) on delete set null,
  rrule text,
  repeat_mode public.repeat_mode not null default 'fixed',
  repeat_after_days int check (repeat_after_days is null or repeat_after_days > 0),
  focus_date date,
  position double precision not null default 0,
  completed_at timestamptz,
  deleted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fts tsvector generated always as (
    to_tsvector('german'::regconfig, coalesce(title, '') || ' ' || coalesce(notes_md, ''))
  ) stored
);
create index tasks_list_due_idx on public.tasks (list_id, due_at) where deleted_at is null;
create index tasks_assignee_idx on public.tasks (assignee_id) where deleted_at is null;
create index tasks_deleted_idx on public.tasks (deleted_at) where deleted_at is not null;
create index tasks_fts_idx on public.tasks using gin (fts);
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- Erledigt-Zeitpunkt automatisch pflegen
create function public.tasks_sync_completed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at = coalesce(new.completed_at, now());
  elsif new.status <> 'done' then
    new.completed_at = null;
  end if;
  return new;
end $$;
create trigger tasks_completed before insert or update on public.tasks
  for each row execute function public.tasks_sync_completed();

-- Zugewiesene Person muss Mitglied der Liste sein
create function public.tasks_check_assignee() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id is not null and not exists (
    select 1 from public.list_members where list_id = new.list_id and user_id = new.assignee_id
  ) then
    raise exception 'Die zugewiesene Person ist kein Mitglied dieser Liste';
  end if;
  return new;
end $$;
create trigger tasks_assignee_check before insert or update of assignee_id, list_id on public.tasks
  for each row execute function public.tasks_check_assignee();

create function public.can_access_task(p_task uuid, p_min public.list_role default 'viewer')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task and public.is_list_member(t.list_id, p_min)
  );
$$;

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  done boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subtasks_task_idx on public.subtasks (task_id);
create trigger subtasks_updated_at before update on public.subtasks
  for each row execute function public.set_updated_at();

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#94a3b8',
  unique (list_id, name)
);

create table public.task_tags (
  task_id uuid not null references public.tasks (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (task_id, tag_id)
);
create index task_tags_tag_idx on public.task_tags (tag_id);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  offset_min int,           -- Minuten vor der Fälligkeit (0 = zum Zeitpunkt)
  at timestamptz,           -- oder fester Zeitpunkt
  fire_at timestamptz,      -- berechneter Versandzeitpunkt (später per Trigger gepflegt)
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (offset_min is not null or at is not null)
);
create index reminders_due_idx on public.reminders (fire_at) where sent_at is null;

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  body text not null check (char_length(body) between 1 and 4000),
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index comments_task_idx on public.comments (task_id, created_at);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime text,
  size_bytes int not null check (size_bytes <= 5242880), -- max. 5 MB
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index attachments_task_idx on public.attachments (task_id);

create table public.activity_log (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  diff jsonb,
  created_at timestamptz not null default now()
);
create index activity_task_idx on public.activity_log (task_id, created_at desc);

-- Aktivitätsverlauf automatisch aus Änderungen an tasks erzeugen
create function public.log_task_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb; v_new jsonb; v_key text; v_diff jsonb := '{}'::jsonb;
  -- null, falls das Profil gerade gelöscht wird (Konto löschen)
  v_actor uuid := (select id from public.profiles where id = auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (task_id, actor_id, action) values (new.id, v_actor, 'created');
    return new;
  end if;
  v_old := to_jsonb(old); v_new := to_jsonb(new);
  foreach v_key in array array['title','status','priority','due_at','due_all_day','assignee_id','list_id','deleted_at'] loop
    if v_old -> v_key is distinct from v_new -> v_key then
      v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
    end if;
  end loop;
  if v_diff <> '{}'::jsonb then
    insert into public.activity_log (task_id, actor_id, action, diff)
    values (new.id, v_actor, 'updated', v_diff);
  end if;
  return new;
end $$;
create trigger tasks_activity after insert or update on public.tasks
  for each row execute function public.log_task_activity();

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 80),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 80),
  filter jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.calendar_tokens (
  user_id uuid primary key references public.profiles (id) on delete cascade default auth.uid(),
  token_hash text not null unique,
  list_ids uuid[],          -- null = alle Listen
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  task_id uuid references public.tasks (id) on delete cascade,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.list_invites enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.tags enable row level security;
alter table public.task_tags enable row level security;
alter table public.reminders enable row level security;
alter table public.comments enable row level security;
alter table public.attachments enable row level security;
alter table public.activity_log enable row level security;
alter table public.templates enable row level security;
alter table public.saved_filters enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.calendar_tokens enable row level security;
alter table public.notifications enable row level security;

-- profiles: eigenes Profil und Profile von Personen, mit denen man eine Liste teilt
create policy profiles_select on public.profiles for select to authenticated
  using (public.shares_list_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- folders: nur eigene
create policy folders_all on public.folders for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- lists
create policy lists_select on public.lists for select to authenticated
  using (owner_id = auth.uid() or public.is_list_member(id));
create policy lists_insert on public.lists for insert to authenticated
  with check (owner_id = auth.uid());
create policy lists_update on public.lists for update to authenticated
  using (public.is_list_member(id, 'owner')) with check (owner_id = auth.uid() or public.is_list_member(id, 'owner'));
create policy lists_delete on public.lists for delete to authenticated
  using (public.is_list_member(id, 'owner'));

-- list_members
create policy members_select on public.list_members for select to authenticated
  using (public.is_list_member(list_id));
create policy members_insert on public.list_members for insert to authenticated
  with check (public.is_list_member(list_id, 'owner') and role <> 'owner');
create policy members_update on public.list_members for update to authenticated
  using (public.is_list_member(list_id, 'owner') and role <> 'owner')
  with check (role <> 'owner');
create policy members_delete on public.list_members for delete to authenticated
  using (public.is_list_member(list_id, 'owner') and role <> 'owner'
         or (user_id = auth.uid() and role <> 'owner'));

-- list_invites: nur Besitzer der Liste
create policy invites_all on public.list_invites for all to authenticated
  using (public.is_list_member(list_id, 'owner')) with check (public.is_list_member(list_id, 'owner'));

-- tasks
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_list_member(list_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_list_member(list_id, 'editor'));
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_list_member(list_id, 'editor')) with check (public.is_list_member(list_id, 'editor'));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_list_member(list_id, 'editor'));

-- Kindtabellen: Zugriff über die zugehörige Pendenz
create policy subtasks_select on public.subtasks for select to authenticated using (public.can_access_task(task_id));
create policy subtasks_write on public.subtasks for all to authenticated
  using (public.can_access_task(task_id, 'editor')) with check (public.can_access_task(task_id, 'editor'));

create policy task_tags_select on public.task_tags for select to authenticated using (public.can_access_task(task_id));
create policy task_tags_write on public.task_tags for all to authenticated
  using (public.can_access_task(task_id, 'editor')) with check (public.can_access_task(task_id, 'editor'));

create policy tags_select on public.tags for select to authenticated using (public.is_list_member(list_id));
create policy tags_write on public.tags for all to authenticated
  using (public.is_list_member(list_id, 'editor')) with check (public.is_list_member(list_id, 'editor'));

-- Erinnerungen sind persönlich
create policy reminders_all on public.reminders for all to authenticated
  using (user_id = auth.uid() and public.can_access_task(task_id))
  with check (user_id = auth.uid() and public.can_access_task(task_id));

-- Kommentare: Leser dürfen lesen, Bearbeiter schreiben; ändern/löschen nur eigene
create policy comments_select on public.comments for select to authenticated using (public.can_access_task(task_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_task(task_id, 'editor'));
create policy comments_update on public.comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy comments_delete on public.comments for delete to authenticated using (author_id = auth.uid());

create policy attachments_select on public.attachments for select to authenticated using (public.can_access_task(task_id));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_access_task(task_id, 'editor'));
create policy attachments_delete on public.attachments for delete to authenticated
  using (public.can_access_task(task_id, 'editor'));

-- Aktivitätsverlauf: nur lesen (geschrieben wird per Trigger)
create policy activity_select on public.activity_log for select to authenticated using (public.can_access_task(task_id));

-- Persönliche Tabellen
create policy templates_all on public.templates for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy saved_filters_all on public.saved_filters for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy push_subscriptions_all on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy calendar_tokens_select on public.calendar_tokens for select to authenticated using (user_id = auth.uid());
create policy calendar_tokens_update on public.calendar_tokens for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Aufrufbare Funktionen (RPC)
-- ---------------------------------------------------------------------------
-- Einladung erstellen: gibt das Klartext-Token einmalig zurück (gespeichert wird nur der Hash).
create function public.create_invite(p_list uuid, p_role public.list_role default 'editor', p_email text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if not public.is_list_member(p_list, 'owner') then
    raise exception 'Nur der Besitzer darf einladen';
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.list_invites (list_id, email, role, token_hash, created_by)
  values (p_list, nullif(lower(trim(p_email)), ''), p_role,
          encode(extensions.digest(convert_to(v_token, 'utf8'), 'sha256'), 'hex'), auth.uid());
  return v_token;
end $$;

-- Einladung per Link annehmen; gibt die Listen-ID zurück
create function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_inv public.list_invites;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select * into v_inv from public.list_invites
  where token_hash = encode(extensions.digest(convert_to(p_token, 'utf8'), 'sha256'), 'hex')
    and accepted_at is null and expires_at > now();
  if not found then raise exception 'Einladung ungültig oder abgelaufen'; end if;
  insert into public.list_members (list_id, user_id, role)
  values (v_inv.list_id, auth.uid(), v_inv.role)
  on conflict (list_id, user_id) do nothing;
  update public.list_invites set accepted_by = auth.uid(), accepted_at = now() where id = v_inv.id;
  return v_inv.list_id;
end $$;

-- Offene Einladungen auf die eigene E-Mail-Adresse automatisch annehmen (beim Login aufrufen)
create function public.claim_email_invites() returns int
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(auth.jwt() ->> 'email'); v_count int := 0; v_inv public.list_invites;
begin
  if auth.uid() is null or v_email is null then return 0; end if;
  for v_inv in
    select * from public.list_invites
    where lower(email) = v_email and accepted_at is null and expires_at > now()
  loop
    insert into public.list_members (list_id, user_id, role)
    values (v_inv.list_id, auth.uid(), v_inv.role)
    on conflict (list_id, user_id) do nothing;
    update public.list_invites set accepted_by = auth.uid(), accepted_at = now() where id = v_inv.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Kalender-Token erzeugen bzw. neu erzeugen (alte URL wird ungültig); Klartext nur einmalig
create function public.rotate_calendar_token() returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.calendar_tokens (user_id, token_hash)
  values (auth.uid(), encode(extensions.digest(convert_to(v_token, 'utf8'), 'sha256'), 'hex'))
  on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now();
  return v_token;
end $$;

-- Konto samt allen Daten löschen (Datenschutz). Eigene Listen werden mitgelöscht.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Ausführungsrechte: nur angemeldete Personen
revoke execute on function
  public.create_invite(uuid, public.list_role, text), public.accept_invite(text),
  public.claim_email_invites(), public.rotate_calendar_token(), public.delete_my_account(),
  public.is_list_member(uuid, public.list_role), public.shares_list_with(uuid),
  public.can_access_task(uuid, public.list_role)
  from public, anon;
grant execute on function
  public.create_invite(uuid, public.list_role, text), public.accept_invite(text),
  public.claim_email_invites(), public.rotate_calendar_token(), public.delete_my_account(),
  public.is_list_member(uuid, public.list_role), public.shares_list_with(uuid),
  public.can_access_task(uuid, public.list_role)
  to authenticated;

-- Anonyme Besucher haben keinerlei Tabellenrechte
revoke all on all tables in schema public from anon;
