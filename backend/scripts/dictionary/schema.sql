-- NativeCue dictionary storage for data extracted from the ENGLISH Wiktionary edition.
-- The source edition supplies English glosses for both English and French entries.
-- This script only creates dictionary_* tables. It does not alter existing NativeCue tables.

CREATE TABLE IF NOT EXISTS dictionary_dataset (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Internal identifier for one imported source snapshot.

    source_url text NOT NULL,
    -- Exact URL used to download the compressed Kaikki/Wiktextract JSONL file.

    source_edition text NOT NULL DEFAULT 'enwiktionary',
    -- Wiktionary edition that produced the data. This importer supports enwiktionary only.

    gloss_language char(2) NOT NULL DEFAULT 'en' CHECK (gloss_language = 'en'),
    -- Language used by senses[].glosses. It is English for the enwiktionary source.

    source_sha256 char(64) NOT NULL,
    -- SHA-256 checksum of the original compressed download, for reproducibility.

    imported_at timestamptz NOT NULL DEFAULT now(),
    -- Time at which this snapshot was registered in PostgreSQL.

    active boolean NOT NULL DEFAULT false,
    -- True only for the snapshot used by /dictionary. Activate after a complete import.

    attribution text NOT NULL,
    -- Human-readable source credit kept with the imported content.

    license_url text NOT NULL,
    -- License reference for the reused dictionary content.

    UNIQUE (source_url, source_sha256)
);

CREATE UNIQUE INDEX IF NOT EXISTS dictionary_dataset_one_active_snapshot
ON dictionary_dataset (source_edition)
WHERE active;
-- Allows only one active enwiktionary snapshot at a time.

CREATE TABLE IF NOT EXISTS dictionary_entry (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Stable internal ID returned to the NativeCue backend and frontend.

    dataset_id bigint NOT NULL REFERENCES dictionary_dataset(id) ON DELETE RESTRICT,
    -- Source snapshot this exact record came from.

    source_line_number bigint NOT NULL,
    -- Original JSONL line number. Useful for auditing and re-importing a specific record.

    language char(2) NOT NULL CHECK (language IN ('en', 'fr')),
    -- Language of the dictionary headword, copied from raw_data.lang_code.

    headword text NOT NULL,
    -- Original spelling from raw_data.word, including accents and case.

    headword_key text NOT NULL,
    -- NFC-normalized, Unicode case-folded search key. Used for case-insensitive lookup.

    part_of_speech text NOT NULL,
    -- Wiktextract POS value such as noun, verb, adj, adv, pron or phrase.

    is_lemma boolean NOT NULL,
    -- False when Wiktionary marks the entry as a non-lemma inflected form.

    source_page_url text NOT NULL,
    -- Direct Wiktionary page URL for attribution and debugging.

    raw_data jsonb NOT NULL CHECK (jsonb_typeof(raw_data) = 'object'),
    -- Complete filtered Wiktextract object. Preserves senses, IPA, forms, examples and metadata.

    UNIQUE (dataset_id, source_line_number)
    -- A JSONL line can only be imported once per dataset snapshot.
);

CREATE INDEX IF NOT EXISTS dictionary_entry_lookup_idx
ON dictionary_entry (language, headword_key, part_of_speech);
-- Main /dictionary lookup: spaCy lemma + language + POS.

CREATE INDEX IF NOT EXISTS dictionary_entry_dataset_idx
ON dictionary_entry (dataset_id);
-- Supports joining entries to the currently active dataset.

CREATE TABLE IF NOT EXISTS dictionary_form (
    entry_id bigint NOT NULL REFERENCES dictionary_entry(id) ON DELETE CASCADE,
    -- Headword entry to which this attested form belongs.

    form text NOT NULL,
    -- Original spelling of an inflected or alternative form from raw_data.forms[].form.

    form_key text NOT NULL,
    -- NFC-normalized, Unicode case-folded form used for lookup.

    tags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tags) = 'array'),
    -- Wiktextract grammatical tags, for example ["plural"] or ["conditional", "first-person"].

    PRIMARY KEY (entry_id, form_key)
    -- Prevents duplicate searchable forms for the same headword entry.
);

CREATE INDEX IF NOT EXISTS dictionary_form_lookup_idx
ON dictionary_form (form_key);
-- Fallback lookup when a word is an inflected form and spaCy's lemma is unavailable or wrong.

COMMENT ON TABLE dictionary_dataset IS 'Metadata and attribution for each imported Kaikki/Wiktextract snapshot.';
COMMENT ON TABLE dictionary_entry IS 'EN/FR Wiktionary entries with complete original Wiktextract JSON stored in raw_data.';
COMMENT ON TABLE dictionary_form IS 'Search index for real Wiktionary forms; metadata pseudo-forms are excluded by the importer.';

COMMENT ON COLUMN dictionary_dataset.id IS 'Internal primary key for the imported source snapshot.';
COMMENT ON COLUMN dictionary_dataset.source_url IS 'Exact Kaikki download URL used for the source file.';
COMMENT ON COLUMN dictionary_dataset.source_edition IS 'Wiktionary edition used as source; this importer uses enwiktionary.';
COMMENT ON COLUMN dictionary_dataset.gloss_language IS 'Language of sense glosses in raw_data; English for this source edition.';
COMMENT ON COLUMN dictionary_dataset.source_sha256 IS 'SHA-256 checksum of the original compressed JSONL file.';
COMMENT ON COLUMN dictionary_dataset.imported_at IS 'Timestamp when the snapshot metadata was inserted.';
COMMENT ON COLUMN dictionary_dataset.active IS 'Whether /dictionary should use this completed snapshot.';
COMMENT ON COLUMN dictionary_dataset.attribution IS 'Required human-readable attribution for source content.';
COMMENT ON COLUMN dictionary_dataset.license_url IS 'License URL applicable to reused dictionary content.';

COMMENT ON COLUMN dictionary_entry.id IS 'Internal primary key for one raw Wiktextract record.';
COMMENT ON COLUMN dictionary_entry.dataset_id IS 'Foreign key to the Kaikki/Wiktextract snapshot that supplied this entry.';
COMMENT ON COLUMN dictionary_entry.source_line_number IS 'One-based line number in the original JSONL stream.';
COMMENT ON COLUMN dictionary_entry.language IS 'Headword language code, restricted to en or fr.';
COMMENT ON COLUMN dictionary_entry.headword IS 'Original Wiktionary spelling of the headword.';
COMMENT ON COLUMN dictionary_entry.headword_key IS 'Unicode-normalized case-insensitive index key for the headword.';
COMMENT ON COLUMN dictionary_entry.part_of_speech IS 'Wiktextract part-of-speech value.';
COMMENT ON COLUMN dictionary_entry.is_lemma IS 'False when source categories mark the record as a non-lemma form.';
COMMENT ON COLUMN dictionary_entry.source_page_url IS 'Wiktionary page URL used for user-facing attribution and debugging.';
COMMENT ON COLUMN dictionary_entry.raw_data IS 'Complete original Wiktextract JSON object for this filtered entry.';

COMMENT ON COLUMN dictionary_form.entry_id IS 'Parent dictionary_entry primary key.';
COMMENT ON COLUMN dictionary_form.form IS 'Original spelling of a real inflected or alternative form.';
COMMENT ON COLUMN dictionary_form.form_key IS 'Unicode-normalized case-insensitive index key for the form.';
COMMENT ON COLUMN dictionary_form.tags IS 'Wiktextract grammatical tags for the indexed form.';
