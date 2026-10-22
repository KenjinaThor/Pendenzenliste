-- Phase 8c: Offline-Synchronisierung (Konfliktregel «neuester Zeitstempel gewinnt, pro Feld») und Dateianhänge

-- ---------------------------------------------------------------------------
-- Änderungen an Pendenzen mit Zeitstempel pro Feld
-- ---------------------------------------------------------------------------
alter table public.tasks add column field_updated_at jsonb not null default '{}'::jsonb;

-- Wendet nur die Felder an, die nicht von einer neueren Änderung überholt wurden. Die App sendet den Zeitpunkt der
-- Bearbeitung (auch wenn sie offline war), nicht den der Synchronisierung.
create function public.update_task_fields(p_task uuid, p_patch jsonb, p_ts timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare
  c_allowed constant text[] := array[
    'list_id', 'title', 'notes_md', 'due_at', 'due_all_day', 'duration_min', 'priority', 'status',
    'assignee_id', 'rrule', 'repeat_mode', 'repeat_after_days', 'focus_date', 'deleted_at', 'position'];
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
  -- in eine andere Liste verschieben: dort braucht man ebenfalls Schreibrechte
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

  -- typgerechte Umwandlung der JSON-Werte über den Zeilentyp der Tabelle
  v_rec := jsonb_populate_record(v_task, v_apply);
  select string_agg(format('%I', k), ', ') into v_cols from jsonb_object_keys(v_apply) k;
  execute format(
    'update public.tasks t set (%1$s) = (select %1$s from (select ($1).*) r), field_updated_at = field_updated_at || $3 where t.id = $2',
    v_cols
  ) using v_rec, p_task, (select jsonb_object_agg(k, to_jsonb(p_ts)) from jsonb_object_keys(v_apply) k);
end $$;

revoke execute on function public.update_task_fields(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.update_task_fields(uuid, jsonb, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Dateianhänge (Supabase Storage): privater Bucket, max. 5 MB pro Datei
-- Der Pfad beginnt mit der Listen-ID: <liste>/<pendenz>/<datei>. Lesen dürfen alle Mitglieder, hochladen und
-- löschen Bearbeiter und Besitzer. (Übersprungen, falls Storage nicht vorhanden ist.)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'Storage ist nicht verfügbar – Anhang-Bucket übersprungen.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('attachments', 'attachments', false, 5242880,
          array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf'])
  on conflict (id) do update
    set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists attachments_read on storage.objects;
  drop policy if exists attachments_insert on storage.objects;
  drop policy if exists attachments_delete on storage.objects;

  create policy attachments_read on storage.objects for select to authenticated
    using (bucket_id = 'attachments' and public.is_list_member(((storage.foldername(name))[1])::uuid));
  create policy attachments_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'attachments' and public.is_list_member(((storage.foldername(name))[1])::uuid, 'editor'));
  create policy attachments_delete on storage.objects for delete to authenticated
    using (bucket_id = 'attachments' and public.is_list_member(((storage.foldername(name))[1])::uuid, 'editor'));
end $$;
