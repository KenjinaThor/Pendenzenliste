-- Phase 6: Teilen, Kommentare, Benachrichtigungen und Echtzeit

-- ---------------------------------------------------------------------------
-- Echtzeit: Änderungen an diesen Tabellen an die Apps melden
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['tasks', 'subtasks', 'comments', 'lists', 'list_members',
                             'activity_log', 'notifications', 'list_invites'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null; -- bereits enthalten
      end;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Mitglied entfernt → zugewiesene Pendenzen wieder freigeben
-- ---------------------------------------------------------------------------
create function public.clear_assignee_on_member_removal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.tasks set assignee_id = null
  where list_id = old.list_id and assignee_id = old.user_id;
  return old;
end $$;
create trigger list_members_clear_assignee after delete on public.list_members
  for each row execute function public.clear_assignee_on_member_removal();

-- ---------------------------------------------------------------------------
-- Benachrichtigung bei Zuweisung
-- ---------------------------------------------------------------------------
create function public.notify_task_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id is not null
     and new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or old.assignee_id is distinct from new.assignee_id) then
    insert into public.notifications (user_id, kind, task_id, payload)
    values (new.assignee_id, 'assigned', new.id, jsonb_build_object(
      'task_title', new.title,
      'actor_name', (select name from public.profiles where id = auth.uid())));
  end if;
  return new;
end $$;
create trigger tasks_notify_assignment after insert or update of assignee_id on public.tasks
  for each row execute function public.notify_task_assignment();

-- ---------------------------------------------------------------------------
-- Neuer Kommentar → Verlauf-Eintrag und Benachrichtigung bei @Erwähnungen
-- ---------------------------------------------------------------------------
create function public.on_comment_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_name text;
  v_uid uuid;
begin
  select * into v_task from public.tasks where id = new.task_id;
  select name into v_name from public.profiles where id = new.author_id;

  insert into public.activity_log (task_id, actor_id, action, diff)
  values (new.task_id, new.author_id, 'commented', jsonb_build_object('excerpt', left(new.body, 140)));

  foreach v_uid in array new.mentions loop
    if v_uid is distinct from new.author_id and exists (
      select 1 from public.list_members where list_id = v_task.list_id and user_id = v_uid
    ) then
      insert into public.notifications (user_id, kind, task_id, payload)
      values (v_uid, 'mention', new.task_id, jsonb_build_object(
        'task_title', v_task.title, 'actor_name', v_name, 'excerpt', left(new.body, 140)));
    end if;
  end loop;
  return new;
end $$;
create trigger comments_created after insert on public.comments
  for each row execute function public.on_comment_created();
