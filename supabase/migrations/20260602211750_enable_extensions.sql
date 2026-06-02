-- pgmq: Postgres-native durable job queue
create extension if not exists pgmq;
-- pg_cron: schedule the drain sweeper, reconciliation, missed-plan sweep
create extension if not exists pg_cron;
-- pgcrypto: gen_random_uuid() for PKs
create extension if not exists pgcrypto;
