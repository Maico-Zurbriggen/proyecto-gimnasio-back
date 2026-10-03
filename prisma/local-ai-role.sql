DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gym_ai_local') THEN
    CREATE ROLE gym_ai_local LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE gym_local TO gym_ai_local;
GRANT USAGE ON SCHEMA ai_integration TO gym_ai_local;
GRANT SELECT, UPDATE ON ai_integration.ai_generation_requests TO gym_ai_local;
GRANT SELECT, INSERT, UPDATE ON ai_integration.ai_generation_attempts TO gym_ai_local;
GRANT SELECT, INSERT ON ai_integration.ai_generation_results TO gym_ai_local;
