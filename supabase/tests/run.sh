#!/usr/bin/env bash
# Führt Migrationen und RLS-Tests gegen eine leere Postgres-Datenbank aus.
# Aufruf: DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?DATABASE_URL setzen}"
psql() { command psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

psql -f supabase/tests/stub.sql
for f in supabase/migrations/*.sql; do
  echo "Migration: $f"
  psql -f "$f"
done
psql -f supabase/tests/helpers.sql
for t in supabase/tests/*.test.sql; do
  echo "== $t"
  if ! out=$(psql -f "$t" 2>&1); then
    echo "$out" | grep -E "FEHLGESCHLAGEN|ERROR|DETAIL|CONTEXT" || echo "$out"
    exit 1
  fi
  echo "$out" | grep "ok - "
done
echo "Alle Tests bestanden."
