-- Der Kalender-Token wird zusätzlich im Klartext gespeichert (nur für den Besitzer lesbar, per RLS),
-- damit die Feed-URL in der App jederzeit wieder angezeigt werden kann. Die Edge Function sucht weiterhin
-- über den Hash.
alter table public.calendar_tokens add column if not exists token text;

create or replace function public.rotate_calendar_token() returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.calendar_tokens (user_id, token, token_hash)
  values (auth.uid(), v_token,
          encode(extensions.digest(convert_to(v_token, 'utf8'), 'sha256'), 'hex'))
  on conflict (user_id) do update
    set token = excluded.token, token_hash = excluded.token_hash, created_at = now();
  return v_token;
end $$;
