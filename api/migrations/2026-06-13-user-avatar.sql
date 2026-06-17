-- Migration: add avatar_url to users
-- Apply once to the live Azure DB via psql or SQL client.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255);
