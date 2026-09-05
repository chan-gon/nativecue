import os

import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS natural_speech_cache (
    id BIGSERIAL PRIMARY KEY,
    cache_key VARCHAR(64) NOT NULL UNIQUE,
    language VARCHAR(10) NOT NULL,
    normalized_text TEXT NOT NULL,
    analysis JSONB NOT NULL,
    prompt_version VARCHAR(20) NOT NULL,
    model VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

with psycopg.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        cur.execute(CREATE_TABLE_SQL)

print("natural_speech_cache table is successfully created")