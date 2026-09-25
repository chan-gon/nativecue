"""Import EN and FR entries from Kaikki's enwiktionary JSONL gzip into PostgreSQL.

Example:
  export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DATABASE'
  python import_kaikki.py data/raw-wiktextract-data.jsonl.gz \
    --source-url 'PASTE_THE_EXACT_KAIKKI_DOWNLOAD_URL_HERE'

Run schema.sql first. Use --limit 10000 for a small import before the full run.
"""
from __future__ import annotations
from dotenv import load_dotenv

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import unicodedata
from urllib.parse import quote

import psycopg
from psycopg.types.json import Jsonb

SUPPORTED_LANGUAGES = {"en": "English", "fr": "French"}
SKIPPED_FORM_TAGS = {"table-tags", "inflection-template", "multiword-construction"}


def search_key(value: str) -> str:
    """Make a lookup key without modifying the original spelling stored in PostgreSQL."""
    return unicodedata.normalize("NFC", value).replace("’", "'").casefold()


def is_lemma(raw: dict) -> bool:
    categories = raw.get("categories", [])
    return not any("non-lemma forms" in category.casefold() for category in categories)


def source_page_url(raw: dict) -> str:
    language_name = SUPPORTED_LANGUAGES[raw["lang_code"]]
    return f"https://en.wiktionary.org/wiki/{quote(raw['word'], safe='')}#{language_name}"


def usable_forms(raw: dict) -> list[dict]:
    """Keep real forms; skip Wiktionary table names and other non-word metadata."""
    forms = []
    seen = set()

    for item in raw.get("forms", []):
        form = item.get("form")
        tags = item.get("tags", [])

        if not isinstance(form, str) or not form or form == "-":
            continue
        if not isinstance(tags, list) or SKIPPED_FORM_TAGS.intersection(tags):
            continue

        form_key = search_key(form)
        if form_key in seen:
            continue

        seen.add(form_key)
        forms.append({"form": form, "form_key": form_key, "tags": tags})

    return forms


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def insert_batch(cursor, dataset_id: int, batch: list[tuple[int, dict]]) -> int:
    inserted = 0

    for line_number, raw in batch:
        entry = cursor.execute(
            """
            INSERT INTO dictionary_entry (
                dataset_id, source_line_number, language, headword, headword_key,
                part_of_speech, is_lemma, source_page_url, raw_data
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (dataset_id, source_line_number) DO NOTHING
            RETURNING id
            """,
            (
                dataset_id,
                line_number,
                raw["lang_code"],
                raw["word"],
                search_key(raw["word"]),
                raw["pos"],
                is_lemma(raw),
                source_page_url(raw),
                Jsonb(raw),
            ),
        ).fetchone()

        if entry is None:
            continue

        inserted += 1
        forms = usable_forms(raw)
        if forms:
            cursor.executemany(
                """
                INSERT INTO dictionary_form (entry_id, form, form_key, tags)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (entry_id, form_key) DO NOTHING
                """,
                [(entry[0], form["form"], form["form_key"], Jsonb(form["tags"])) for form in forms],
            )

    return inserted


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_file", type=Path, help="Downloaded raw-wiktextract-data.jsonl.gz file")
    parser.add_argument("--source-url", required=True, help="Exact Kaikki URL used for this download")
    parser.add_argument("--limit", type=int, help="Import only this many EN/FR entries for a safe first test")
    parser.add_argument("--batch-size", type=int, default=1_000)
    parser.add_argument("--activate", action="store_true", help="Make this snapshot active after a successful full import")
    arguments = parser.parse_args()

    if arguments.limit is not None and arguments.limit < 1:
        parser.error("--limit must be at least 1")
    if arguments.batch_size < 1:
        parser.error("--batch-size must be at least 1")
    if not arguments.source_file.is_file():
        parser.error(f"File not found: {arguments.source_file}")
    if not os.getenv("DATABASE_URL"):
        parser.error("DATABASE_URL is required")
    if arguments.activate and arguments.limit:
        parser.error("Do not use --activate with --limit; a partial snapshot must not serve production requests")

    return arguments


def main() -> None:
    env_file = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(env_file)

    arguments = parse_arguments()
    checksum = file_sha256(arguments.source_file)
    database_url = os.environ["DATABASE_URL"]

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            # Prevent two long-running imports from mixing snapshots in the same database.
            cursor.execute("SELECT pg_advisory_xact_lock(93827461)")
            dataset = cursor.execute(
                """
                INSERT INTO dictionary_dataset (
                    source_url, source_sha256, attribution, license_url
                ) VALUES (%s, %s, %s, %s)
                ON CONFLICT (source_url, source_sha256) DO UPDATE
                SET source_url = EXCLUDED.source_url
                RETURNING id
                """,
                (
                    arguments.source_url,
                    checksum,
                    "English Wiktionary contributors; extracted by Wiktextract and distributed by Kaikki.org.",
                    "https://creativecommons.org/licenses/by-sa/4.0/",
                ),
            ).fetchone()
            dataset_id = dataset[0]

            source_lines = 0
            matched_entries = 0
            inserted_entries = 0
            batch: list[tuple[int, dict]] = []

            with gzip.open(arguments.source_file, "rt", encoding="utf-8") as source:
                for line_number, line in enumerate(source, start=1):
                    source_lines = line_number
                    raw = json.loads(line)

                    if raw.get("lang_code") not in SUPPORTED_LANGUAGES:
                        continue
                    if not isinstance(raw.get("word"), str) or not isinstance(raw.get("pos"), str):
                        continue

                    matched_entries += 1
                    batch.append((line_number, raw))

                    if len(batch) >= arguments.batch_size:
                        inserted_entries += insert_batch(cursor, dataset_id, batch)
                        batch.clear()
                        print(f"Read {source_lines:,} JSONL lines; matched {matched_entries:,}; inserted {inserted_entries:,}")

                    if arguments.limit and matched_entries >= arguments.limit:
                        break

            if batch:
                inserted_entries += insert_batch(cursor, dataset_id, batch)

            if arguments.activate:
                cursor.execute("UPDATE dictionary_dataset SET active = false WHERE source_edition = 'enwiktionary'")
                cursor.execute("UPDATE dictionary_dataset SET active = true WHERE id = %s", (dataset_id,))

    print(
        f"Finished. Read {source_lines:,} lines; matched {matched_entries:,} EN/FR entries; "
        f"inserted {inserted_entries:,}. Dataset id: {dataset_id}."
    )


if __name__ == "__main__":
    main()
