-- Enable Row Level Security (RLS) on every table in the public schema.
--
-- Why: Supabase exposes public-schema tables through its Data API (PostgREST)
-- to the `anon` and `authenticated` roles. Prisma-created tables have RLS off by
-- default, so anyone holding the project URL and public anon key could read
-- sensitive tables such as "User" (password hashes), "RefreshToken" and
-- "PasswordResetCode".
--
-- Effect on the API: none. Prisma connects as the table owner (the `postgres`
-- role on Supabase), which bypasses RLS. Enabling RLS without policies only
-- blocks the Data API roles, which have no business reading these tables.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- Remove direct table privileges from the Supabase Data API roles as defence in
-- depth. These roles only exist on Supabase, so each statement is conditional.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
  END IF;
END $$;
