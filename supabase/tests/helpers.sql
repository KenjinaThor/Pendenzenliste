-- Hilfsfunktionen für die SQL-Tests (Schema «test»)
\set ON_ERROR_STOP on

create schema test;
grant usage on schema test to anon, authenticated;

create function test.ok(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FEHLGESCHLAGEN: %', label; end if;
  raise notice 'ok - %', label;
end $$;

-- führt SQL aus und meldet, ob es einen Fehler gab (z. B. durch RLS)
create function test.throws(stmt text) returns boolean language plpgsql as $$
begin execute stmt; return false; exception when others then return true; end $$;

-- führt SQL aus und gibt die Anzahl betroffener Zeilen zurück
create function test.rows(stmt text) returns int language plpgsql as $$
declare n int;
begin execute stmt; get diagnostics n = row_count; return n; end $$;

grant execute on all functions in schema test to anon, authenticated;

