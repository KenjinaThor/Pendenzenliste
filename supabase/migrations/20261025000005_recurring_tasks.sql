-- Phase 8a: wiederkehrende Pendenzen
-- Beim Erledigen entsteht die nächste Pendenz als Kopie (Unteraufgaben zurückgesetzt, Tags und Erinnerungen
-- übernommen); die erledigte bleibt im Archiv. Den nächsten Termin berechnet die App (src/lib/recurrence.ts).

-- Beim automatischen Anlegen der Folge-Pendenz keine erneute Zuweisungs-Mitteilung auslösen
create or replace function public.notify_task_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.skip_assignment_notify', true), '') = '1' then
    return new;
  end if;
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

create function public.complete_recurring_task(p_task uuid, p_next_due timestamptz) returns uuid
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
                            assignee_id, rrule, repeat_mode, repeat_after_days, position, created_by)
  values (v_task.list_id, v_task.title, v_task.notes_md, p_next_due, v_task.due_all_day, v_task.duration_min,
          v_task.priority, 'open', v_task.assignee_id, v_task.rrule, v_task.repeat_mode,
          v_task.repeat_after_days, v_task.position, auth.uid())
  returning id into v_new;

  insert into public.subtasks (task_id, title, done, position)
  select v_new, title, false, position from public.subtasks where task_id = p_task;
  insert into public.task_tags (task_id, tag_id)
  select v_new, tag_id from public.task_tags where task_id = p_task;
  insert into public.reminders (task_id, user_id, offset_min)
  select v_new, user_id, offset_min from public.reminders where task_id = p_task and offset_min is not null;

  -- die erledigte Pendenz wiederholt sich nicht mehr (das übernimmt die neue)
  update public.tasks set status = 'done', rrule = null, repeat_after_days = null where id = p_task;
  return v_new;
end $$;

-- Rückgängig: Folge-Pendenz löschen, Original wieder öffnen und seine Wiederholung herstellen
create function public.undo_recurring_completion(
  p_task uuid, p_clone uuid, p_rrule text, p_mode public.repeat_mode, p_after int
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_clone public.tasks;
begin
  select * into v_task from public.tasks where id = p_task for update;
  select * into v_clone from public.tasks where id = p_clone for update;
  if v_task.id is null or v_clone.id is null
     or not public.is_list_member(v_task.list_id, 'editor') then
    raise exception 'Keine Berechtigung';
  end if;
  if v_clone.list_id <> v_task.list_id or v_clone.status = 'done' or v_task.status <> 'done' then
    raise exception 'Rückgängig nicht möglich';
  end if;
  delete from public.tasks where id = p_clone;
  update public.tasks
  set status = 'open', rrule = p_rrule, repeat_mode = p_mode, repeat_after_days = p_after
  where id = p_task;
end $$;

revoke execute on function
  public.complete_recurring_task(uuid, timestamptz),
  public.undo_recurring_completion(uuid, uuid, text, public.repeat_mode, int)
  from public, anon;
grant execute on function
  public.complete_recurring_task(uuid, timestamptz),
  public.undo_recurring_completion(uuid, uuid, text, public.repeat_mode, int)
  to authenticated;
