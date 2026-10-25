-- Phase 9c: Standard-Einstellungen (Kalender-Abo, Standardliste). Dieses Skript darf mehrfach laufen und
-- enthält alles aus 20261027000007_calendar_choice.sql – es genügt also, nur dieses auszuführen.

alter table public.tasks add column if not exists in_calendar boolean not null default true;
alter table public.profiles add column if not exists calendar_default boolean not null default true;
alter table public.profiles add column if not exists default_list_id uuid references public.lists (id) on delete set null;

create or replace function public.update_task_fields(p_task uuid, p_patch jsonb, p_ts timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare
  c_allowed constant text[] := array[
    'list_id', 'title', 'notes_md', 'due_at', 'due_all_day', 'duration_min', 'priority', 'status',
    'assignee_id', 'rrule', 'repeat_mode', 'repeat_after_days', 'focus_date', 'deleted_at', 'position',
    'in_calendar'];
  v_task public.tasks;
  v_apply jsonb := '{}'::jsonb;
  v_key text;
  v_rec public.tasks;
  v_cols text;
begin
  select * into v_task from public.tasks where id = p_task for update;
  if not found or not public.is_list_member(v_task.list_id, 'editor') then
    raise exception 'Keine Berechtigung';
  end if;
  if p_patch ? 'list_id' and not public.is_list_member((p_patch ->> 'list_id')::uuid, 'editor') then
    raise exception 'Keine Berechtigung für die Ziel-Liste';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key = any (c_allowed)
       and (v_task.field_updated_at ->> v_key is null
            or p_ts >= (v_task.field_updated_at ->> v_key)::timestamptz) then
      v_apply := v_apply || jsonb_build_object(v_key, p_patch -> v_key);
    end if;
  end loop;
  if v_apply = '{}'::jsonb then return; end if;

  v_rec := jsonb_populate_record(v_task, v_apply);
  select string_agg(format('%I', k), ', ') into v_cols from jsonb_object_keys(v_apply) k;
  execute format(
    'update public.tasks t set (%1$s) = (select %1$s from (select ($1).*) r), field_updated_at = field_updated_at || $3 where t.id = $2',
    v_cols
  ) using v_rec, p_task, (select jsonb_object_agg(k, to_jsonb(p_ts)) from jsonb_object_keys(v_apply) k);
end $$;

create or replace function public.complete_recurring_task(p_task uuid, p_next_due timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_new uuid;
begin
  select * into v_task from public.tasks where id = p_task for update;
  if not found or not public.is_list_member(v_task.list_id, 'editor') then
    raise exception 'Keine Berechtigung';
  end if;
  if v_task.rrule is null and v_task.repeat_after_days is null then
    raise exception 'Diese Pendenz wiederholt sich nicht';
  end if;

  perform set_config('app.skip_assignment_notify', '1', true);

  insert into public.tasks (list_id, title, notes_md, due_at, due_all_day, duration_min, priority, status,
                            assignee_id, rrule, repeat_mode, repeat_after_days, position, created_by, in_calendar)
  values (v_task.list_id, v_task.title, v_task.notes_md, p_next_due, v_task.due_all_day, v_task.duration_min,
          v_task.priority, 'open', v_task.assignee_id, v_task.rrule, v_task.repeat_mode,
          v_task.repeat_after_days, v_task.position, auth.uid(), v_task.in_calendar)
  returning id into v_new;

  insert into public.subtasks (task_id, title, done, position)
  select v_new, title, false, position from public.subtasks where task_id = p_task;
  insert into public.task_tags (task_id, tag_id)
  select v_new, tag_id from public.task_tags where task_id = p_task;
  insert into public.reminders (task_id, user_id, offset_min)
  select v_new, user_id, offset_min from public.reminders where task_id = p_task and offset_min is not null;

  update public.tasks set status = 'done', rrule = null, repeat_after_days = null where id = p_task;
  return v_new;
end $$;

-- Die Datenbank-Schnittstelle (PostgREST) soll die neuen Spalten sofort kennen
notify pgrst, 'reload schema';
