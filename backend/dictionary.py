import logging
import os
import unicodedata
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Literal

import psycopg
from dotenv import load_dotenv
from fastapi import HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel, Field, field_validator

load_dotenv(Path(__file__).resolve().parent / ".env")
logger = logging.getLogger(__name__)
Language = Literal["en", "fr"]
POS = {"NOUN": "noun", "PROPN": "name", "VERB": "verb", "AUX": "verb",
       "ADJ": "adj", "ADV": "adv", "PRON": "pron", "DET": "det",
       "ADP": "prep", "CCONJ": "conj", "SCONJ": "conj",
       "NUM": "num", "INTJ": "intj", "PART": "particle"}


class DictionaryRequest(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    language: Language
    target_language: Language

    @field_validator("text", mode="before")
    @classmethod
    def strip_text(cls, value):
        return value.strip() if isinstance(value, str) else value


def key(text):
    # Must agree with schema.sql/importer: NFC + casefold, no accent removal.
    return unicodedata.normalize("NFC", text).casefold()


def strings(value):
    return [x for x in value if isinstance(x, str)] if isinstance(value, list) else []


def objects(value):
    return [x for x in value if isinstance(x, dict)] if isinstance(value, list) else []


def text(value):
    return value if isinstance(value, str) else ""


@lru_cache(maxsize=2)
def language_model(language):
    import spacy
    name = {"en": "en_core_web_sm", "fr": "fr_core_news_sm"}[language]
    try:
        return spacy.load(name, disable=["ner", "parser"])
    except OSError as exc:
        logger.error("Missing spaCy model: %s", name)
        raise HTTPException(503, f"Dictionary language model is missing: {name}") from exc


def sentence_words(sentence, language):
    # Unlike analyzer.normalize_text, preserve case and punctuation for NLP.
    sentence = unicodedata.normalize("NFC", sentence).replace("’", "'")
    words, seen = [], set()
    for token in language_model(language)(sentence):
        if token.is_space or token.is_punct or token.like_num:
            continue
        lemma = token.lemma_ or token.text
        pos = POS.get(token.pos_, "")
        identity = (key(token.text), key(lemma), pos)
        if identity in seen:
            continue
        seen.add(identity)
        words.append({"surface": token.text, "lemma": lemma, "pos": pos,
                      "index": token.i})
    return words


# Query both indexes once for all token/lemma keys. No JSON scan or LIKE '%...%'.
# Each key has a candidate cap, then Python ranks the results by contextual POS.
LOOKUP_SQL = """
WITH requested AS (SELECT unnest(%s::text[]) AS lookup_key)
SELECT requested.lookup_key, candidate.*
FROM requested
CROSS JOIN LATERAL (
    SELECT e.*, 'headword' AS match_type
    FROM dictionary_entry e
    WHERE e.dataset_id = %s AND e.language = %s
      AND e.headword_key = requested.lookup_key
    ORDER BY e.is_lemma DESC, e.id
    LIMIT 40
) candidate
UNION ALL
SELECT requested.lookup_key, candidate.*
FROM requested
CROSS JOIN LATERAL (
    SELECT e.*, 'form' AS match_type
    FROM dictionary_form f
    JOIN dictionary_entry e ON e.id = f.entry_id
    WHERE e.dataset_id = %s AND e.language = %s
      AND f.form_key = requested.lookup_key
    ORDER BY e.is_lemma DESC, e.id
    LIMIT 40
) candidate
"""


def fetch_candidates(cursor, keys, dataset_id, language):
    if not keys:
        return []
    cursor.execute(LOOKUP_SQL, (sorted(keys), dataset_id, language, dataset_id, language))
    return cursor.fetchall()

def select_entries(word, rows):
    surface_key = key(word["surface"])
    lemma_key = key(word["lemma"])
    expected_pos = word["pos"]

    candidates = {}

    for row in rows:
        if row["lookup_key"] not in {surface_key, lemma_key}:
            continue

        candidates[row["id"]] = row

    if not candidates:
        return []

    candidate_list = list(candidates.values())

    def is_same_pos(row):
        entry_pos = row["part_of_speech"]

        if entry_pos == expected_pos:
            return True

        # spaCy의 DET와 Wiktionary의 article은 같은 계열로 취급
        if expected_pos == "det" and entry_pos == "article":
            return True

        return False

    same_pos_candidates = [
        row
        for row in candidate_list
        if is_same_pos(row)
    ]

    # 품사가 맞는 후보가 있으면 그 후보들 안에서만 선택한다.
    # 하나도 없을 때만 전체 후보를 사용한다.
    selection_pool = same_pos_candidates or candidate_list

    def rank(row):
        return (
            # 1. 분석된 원형과 같은 표제어 우선
            row["headword_key"] != lemma_key,

            # 2. 입력 형태와 같은 표제어 우선
            row["headword_key"] != surface_key,

            # 3. Wiktionary의 정식 표제어 우선
            not row["is_lemma"],

            # 4. 대소문자까지 정확히 같은 항목 우선
            row["headword"] != word["surface"],

            # 5. 결과를 항상 일정하게 유지
            row["id"],
        )

    best_entry = min(selection_pool, key=rank)

    return [best_entry]

def first_ipa(raw):
    for sound in objects(raw.get("sounds")):
        # Exclude pronunciations explicitly attached to a different form.
        if sound.get("form") and sound["form"] != raw.get("word"):
            continue
        ipa = text(sound.get("ipa"))
        if ipa:
            return ipa
    return ""


def real_forms(raw):
    for form in objects(raw.get("forms")):
        value = text(form.get("form"))
        tags = strings(form.get("tags"))
        # Kaikki occasionally puts an IPA transcription (for example ``pø``)
        # in the spelling field. It must not become a conjugated word.
        is_spelling = (
            all(character.isalpha() or character in "'’ -" for character in value)
            and not any(character in "øəɐɑɒɛɜɞɪʊʃʒɲŋɥ" for character in value)
        )
        if value and is_spelling and value not in {"-", "—", "?"} and not set(tags) & {
            "table-tags", "inflection-template", "class"
        }:
            yield form


PERSON_KEYS = {
    ("first-person", "singular"): "1s",
    ("second-person", "singular"): "2s",
    ("third-person", "singular"): "3s",
    ("first-person", "plural"): "1p",
    ("second-person", "plural"): "2p",
    ("third-person", "plural"): "3p",
}
GRAMMAR_TAG_ORDER = (
    "present", "past", "future", "imperfect", "pluperfect", "perfect",
    "indicative", "subjunctive", "conditional", "imperative", "historic", "anterior",
    "infinitive", "participle", "gerund", "simple", "progressive",
)
GRAMMAR_TAGS = set(GRAMMAR_TAG_ORDER)


def person_key(tags):
    tags = set(tags)
    person = next((tag for tag in ("first-person", "second-person", "third-person")
                   if tag in tags), None)
    number = next((tag for tag in ("singular", "plural") if tag in tags), None)
    return PERSON_KEYS.get((person, number))


def subject_from_key(person):
    return {
        "1s": "first-person · singular", "2s": "second-person · singular",
        "3s": "third-person · singular", "1p": "first-person · plural",
        "2p": "second-person · plural", "3p": "third-person · plural",
    }[person]


def compound_specs(raw):
    """Read Kaikki's own 'avoir/être + past participle' templates.

    The template supplies both the result tense tags and the auxiliary tense,
    so this does not guess which compound tenses a verb possesses.
    """
    for form in objects(raw.get("forms")):
        tags = set(strings(form.get("tags")))
        value = text(form.get("form")).lower()
        if "multiword-construction" not in tags or not value.endswith("+ past participle"):
            continue
        for auxiliary in ("avoir", "être"):
            marker = f" of {auxiliary} + past participle"
            if not value.endswith(marker):
                continue
            source_tags = set(value.removesuffix(marker).split()) & GRAMMAR_TAGS
            source_tags.discard("simple")
            result_tags = tags & GRAMMAR_TAGS
            if result_tags == {"imperative"}:
                result_tags.add("perfect")
            if source_tags and result_tags:
                yield auxiliary, source_tags, result_tags


def forms_for_tags(raw, required_tags):
    forms = {}
    for form in real_forms(raw):
        tags = set(strings(form.get("tags")))
        person = person_key(tags)
        if person and required_tags <= tags:
            forms.setdefault(person, {
                "form": text(form.get("form")),
                "ipa": text(form.get("ipa")),
            })
    return forms


def past_participles(raw):
    variants = {"masculine": {}, "feminine": {}}
    fallback = None
    for form in real_forms(raw):
        tags = set(strings(form.get("tags")))
        if not {"past", "participle"} <= tags:
            continue
        value = text(form.get("form"))
        record = {"form": value, "ipa": text(form.get("ipa"))}
        fallback = fallback or record
        gender = "feminine" if "feminine" in tags else "masculine"
        number = "plural" if "plural" in tags else "singular"
        variants[gender].setdefault(number, record)
    return variants, fallback


def combine_compound(auxiliary_form, participle_variants, fallback, person):
    number = "plural" if person.endswith("p") else "singular"
    options = []
    for gender in ("masculine", "feminine"):
        participle = participle_variants[gender].get(number) or fallback
        if participle and participle not in options:
            options.append(participle)
    if not options:
        return None
    forms = [f'{auxiliary_form["form"]} {option["form"]}' for option in options]
    ipas = [" ".join(filter(None, (auxiliary_form["ipa"], option["ipa"])))
            for option in options]
    return {"form": " / ".join(forms), "ipa": " / ".join(filter(None, ipas))}


def add_compound_groups(groups, raw, auxiliaries):
    participle_variants, fallback = past_participles(raw)
    if not fallback:
        return
    for auxiliary, source_tags, result_tags in compound_specs(raw):
        auxiliary_raw = auxiliaries.get(auxiliary)
        if not auxiliary_raw:
            continue
        group = " · ".join(tag for tag in GRAMMAR_TAG_ORDER if tag in result_tags)
        existing = {(item["subject"], item["form"]) for item in groups[group]}
        for person, auxiliary_form in forms_for_tags(auxiliary_raw, source_tags).items():
            compound = combine_compound(auxiliary_form, participle_variants, fallback, person)
            if not compound:
                continue
            item = {"subject": subject_from_key(person), **compound,
                    "example": "", "translation": ""}
            identity = (item["subject"], item["form"])
            if identity not in existing:
                groups[group].append(item)
                existing.add(identity)


def verb_details(raw, auxiliaries=None):
    groups = defaultdict(list)
    details = {}
    seen = set()
    for form in real_forms(raw):
        value = form["form"]
        tags = strings(form.get("tags"))
        if "participle" in tags:
            for tense in ("present", "past"):
                if tense in tags:
                    if f"{tense}_participle" not in details:
                        details[f"{tense}_participle"] = value
                        details[f"{tense}_participle_ipa"] = text(form.get("ipa"))
        # Preserve grammatical tags instead of guessing ambiguous pronouns.
        person = [t for t in tags if t.endswith("-person") or t in {"singular", "plural"}]
        tense = [t for t in tags if t in GRAMMAR_TAGS]
        if not tense:
            continue
        group = " · ".join(tense)
        subject = " · ".join(person) or "—"
        identity = (group, subject, value)
        if identity in seen:
            continue
        seen.add(identity)
        groups[group].append({"subject": subject, "form": value,
                              "ipa": text(form.get("ipa")),
                              "example": "", "translation": ""})
    if auxiliaries:
        add_compound_groups(groups, raw, auxiliaries)
    if not groups and not details:
        return None
    details["groups"] = [{"tense": name, "forms": forms} for name, forms in groups.items()]
    return details


def to_entry(row, word, dataset, target_language, auxiliaries=None):
    raw = row["raw_data"]
    definitions, examples, usage = [], [], []
    seen_definitions, seen_examples = set(), set()
    for sense in objects(raw.get("senses")):
        glosses = strings(sense.get("glosses")) or strings(sense.get("raw_glosses"))
        meaning = " / ".join(glosses)
        if meaning and meaning not in seen_definitions:
            seen_definitions.add(meaning)
            definitions.append({"meaning": meaning,
                                "register": ", ".join(strings(sense.get("tags")))})
        for example in objects(sense.get("examples")):
            sentence = text(example.get("text"))
            if not sentence or sentence in seen_examples:
                continue
            seen_examples.add(sentence)
            # enwiktionary example translations are English, not arbitrary target language.
            translated = text(example.get("translation")) or text(example.get("english"))
            examples.append({"sentence": sentence,
                             "translation": translated if target_language == "en" else ""})

    usage.append({"label": "Definition language", "value": "English (English Wiktionary)"})
    # Lexical translations are distinct from definition translations.
    lexical = []
    for container in [raw, *objects(raw.get("senses"))]:
        for translation in objects(container.get("translations")):
            if translation.get("code") == target_language and text(translation.get("word")):
                value = translation["word"]
                if translation.get("sense"):
                    value += " — " + text(translation["sense"])
                if value not in lexical:
                    lexical.append(value)
    if lexical:
        usage.append({"label": f"Dictionary equivalents ({target_language}); sense may vary",
                      "value": "; ".join(lexical)})
    tags = strings(raw.get("tags"))
    gender_tags = set(tags)
    for sense in objects(raw.get("senses")):
        gender_tags.update(strings(sense.get("tags")))
    if tags:
        usage.append({"label": "Entry tags", "value": ", ".join(tags)})
    forms = list(real_forms(raw))
    matching_tags = sorted({tag for form in forms
                            if key(form["form"]) == key(word["surface"])
                            for tag in strings(form.get("tags"))})
    related, seen_related = [], set()
    for form in forms:
        value = form["form"]
        if key(value) == row["headword_key"] or value in seen_related:
            continue
        seen_related.add(value)
        related.append({"word": value, "part_of_speech": row["part_of_speech"],
                        "ipa": text(form.get("ipa"))})
    entry = {
        # Same lemma can appear with different surface forms in one sentence.
        "id": f'{word["index"]}:{row["id"]}',
        "source_word": word["surface"], "lemma": row["headword"],
        "language": row["language"], "part_of_speech": row["part_of_speech"],
        "ipa": first_ipa(raw), "definitions": definitions,
        "etymology": text(raw.get("etymology_text")), "examples": examples,
        "usage": usage, "related_forms": related,
        "inflection": ", ".join(matching_tags),
        "gender": ", ".join(t for t in sorted(gender_tags) if t in {"masculine", "feminine", "neuter", "common-gender"}),
        "source": {"page_url": row["source_page_url"],
                   "attribution": dataset["attribution"], "license_url": dataset["license_url"]},
    }
    if row["part_of_speech"] == "verb":
        verb = verb_details(raw, auxiliaries)
        if verb:
            entry["verb"] = verb
    return entry


def lookup_dictionary(request):
    words = sentence_words(request.text, request.language)
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        raise HTTPException(503, "DATABASE_URL is not configured.")
    with psycopg.connect(dsn, row_factory=dict_row, connect_timeout=5) as conn:
        with conn.cursor() as cursor:
            cursor.execute("SET TRANSACTION READ ONLY")
            cursor.execute("SET LOCAL statement_timeout = '5s'")
            cursor.execute("""
                SELECT id, attribution, license_url FROM dictionary_dataset
                WHERE active = true AND source_edition = 'enwiktionary'
            """)
            dataset = cursor.fetchone()
            if not dataset:
                raise HTTPException(503, "No active dictionary dataset. Activate a completed import.")
            auxiliaries = {}
            if request.language == "fr":
                cursor.execute("""
                    SELECT headword, raw_data
                    FROM dictionary_entry
                    WHERE dataset_id = %s AND language = 'fr' AND is_lemma = true
                      AND headword_key = ANY(%s)
                """, (dataset["id"], [key("avoir"), key("être")]))
                auxiliaries = {row["headword"]: row["raw_data"] for row in cursor.fetchall()}
            keys = {key(w[field]) for w in words for field in ("surface", "lemma")}
            rows = fetch_candidates(cursor, keys, dataset["id"], request.language)

            # One additional batch resolves explicit Wiktionary form_of links.
            references = defaultdict(set)
            for row in rows:
                if not row["is_lemma"]:
                    for sense in objects(row["raw_data"].get("senses")):
                        for ref in objects(sense.get("form_of")):
                            if text(ref.get("word")):
                                references[key(ref["word"])].add(row["lookup_key"])
            extra = fetch_candidates(cursor, set(references), dataset["id"], request.language)
            for row in extra:
                for original_key in references[row["lookup_key"]]:
                    rows.append({**row, "lookup_key": original_key})

    entries, unmatched = [], []
    for word in words:
        matches = select_entries(word, rows)
        if not matches:
            unmatched.append(word["surface"])
        entries.extend(to_entry(row, word, dataset, request.target_language, auxiliaries) for row in matches)
    return {"entries": entries, "unmatched_words": unmatched,
            "definition_language": "en", "dataset_id": str(dataset["id"])}


def get_dictionary(request: DictionaryRequest):
    try:
        return lookup_dictionary(request)
    except psycopg.errors.QueryCanceled as exc:
        raise HTTPException(504, "Dictionary lookup timed out.") from exc
    except psycopg.OperationalError as exc:
        logger.warning("Dictionary database connection failed")
        raise HTTPException(503, "Dictionary database is unavailable.") from exc
    except psycopg.Error as exc:
        logger.error("Dictionary database error: %s", type(exc).__name__)
        raise HTTPException(500, "Dictionary database query failed. Check server logs and schema.") from exc
