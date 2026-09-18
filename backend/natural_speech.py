import os
import hashlib
import time
from typing import Literal

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel
from database import get_connection
from psycopg.types.json import Jsonb

from prompts import (
    PROMPT_VERSIONS,
    EN_SYSTEM_PROMPT,
    FR_SYSTEM_PROMPT,
)

from analyzer import (
    normalize_text,
    tokenize_words,
)

load_dotenv()

if not os.getenv("OPENAI_API_KEY"):
    raise RuntimeError(
        "OPENAI_API_KEY is not configured."
    )

client = OpenAI()

MODEL = os.getenv(
    "OPENAI_MODEL",
    "gpt-5.4-mini",
)

NaturalSpeechCueType = Literal[
    # English
    "stress",
    "linking",
    "reduction",

    # French
    "rhythm_group",
    "liaison",
    "enchainement",
    "elision",
    "schwa",
]

LOCK_TIMEOUT_SECONDS = 15
LOCK_RETRY_INTERVAL = 0.1

class NaturalSpeechCue(BaseModel):
    type: NaturalSpeechCueType
    start_word: int
    end_word: int
    display: str
    explanation: str

class NaturalSpeechOutput(BaseModel):
    cues: list[NaturalSpeechCue]

def build_user_prompt(
    text: str,
    words: list[str],
    language: str,
) -> str:

    indexed_words = "\n".join(
        f"{index}: {word}"
        for index, word in enumerate(words)
    )

    return f"""
Language: {language}

Original sentence:
{text}

Word indexes:
{indexed_words}

Analyze the sentence for useful natural-speech cues.
""".strip()

# Generate a deterministic cache key from the analysis inputs.
# The same text, language, model, and prompt version always produce the same key,
# allowing identical requests to reuse a previously cached analysis.
def create_cache_key(
    text: str,
    language: str,
    model: str,
    prompt_version: str,
) -> str:
    source = "|".join([language, model, prompt_version, text,])

    return hashlib.sha256(source.encode("utf-8")).hexdigest()

# Converts the deterministic cache key into a signed 64-bit integer that can be used as a PostgreSQL advisory lock ID.
# Identical cache keys produce the same lock ID, preventing concurrent requests for the same analysis from calling the API simultaneously.
def create_lock_id(cache_key: str) -> int:
    value = int(cache_key[:16], 16)

    # PostgreSQL BIGINT signed range
    if value >= 2**63:
        value -= 2**64

    return value

def get_system_prompt(language: str) -> str:
    if language == "en":
        return EN_SYSTEM_PROMPT

    if language == "fr":
        return FR_SYSTEM_PROMPT

    raise ValueError(f"Unsupported Natural Speech language: {language}")

def call_openai(
    text: str,
    language: str,
    words: list[str],
) -> NaturalSpeechOutput:

    response = client.responses.parse(
        model=MODEL,
        instructions=get_system_prompt(language),
        input=build_user_prompt(
            text=text,
            words=words,
            language=language,
        ),
        text_format=NaturalSpeechOutput,
    )

    for output in response.output:
        if output.type != "message":
            continue

        for content in output.content:
            if content.type != "output_text":
                continue

            if content.parsed:
                return content.parsed

    raise RuntimeError(
        "No parsed Natural Speech response."
    )

def find_cached_analysis(
    cache_key: str,
    conn=None,
):
    if conn is None:
        with get_connection() as new_conn:
            return find_cached_analysis(
                cache_key,
                new_conn,
            )
    
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT analysis
            FROM natural_speech_cache
            WHERE cache_key = %s
            """,
            (cache_key,),
        )

        row = cursor.fetchone()

    return row[0] if row else None

def save_cached_analysis(
    cache_key: str,
    language: str,
    normalized_text: str,
    analysis: dict,
    prompt_version: str,
    model: str,
    conn=None,
):
    if conn is None:
        with get_connection() as new_conn:
            save_cached_analysis(
                cache_key=cache_key,
                language=language,
                normalized_text=normalized_text,
                analysis=analysis,
                prompt_version=prompt_version,
                model=model,
                conn=new_conn,
            )
            new_conn.commit()
            return

    with conn.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO natural_speech_cache (
                cache_key,
                language,
                normalized_text,
                analysis,
                prompt_version,
                model
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (cache_key)
            DO NOTHING
            """,
            (
                cache_key,
                language,
                normalized_text,
                Jsonb(analysis),
                prompt_version,
                model,
            ),
        )

def save_request_log(
    cache_key: str,
    language: str,
    normalized_text: str,
    cache_hit: bool,
    status: str,
    response_time_ms: int,
):
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO natural_speech_requests (
                        cache_key,
                        language,
                        normalized_text,
                        cache_hit,
                        status,
                        response_time_ms
                    )
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        cache_key,
                        language,
                        normalized_text,
                        cache_hit,
                        status,
                        response_time_ms,
                    ),
                )

            conn.commit()

    except Exception as error:
        # Analytics logging failure should not break
        # the Natural Speech request itself.
        print(
            f"[NaturalSpeech] REQUEST LOG ERROR: {error}"
        )

def acquire_cache_lock(
    conn,
    lock_id: int,
    timeout: float = LOCK_TIMEOUT_SECONDS,
) -> bool:
    deadline = time.monotonic() + timeout

    while time.monotonic() < deadline:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT pg_try_advisory_lock(%s)",
                (lock_id,),
            )

            acquired = cursor.fetchone()[0]

        if acquired:
            return True

        time.sleep(LOCK_RETRY_INTERVAL)

    return False


def release_cache_lock(
    conn,
    lock_id: int,
):
    with conn.cursor() as cursor:
        cursor.execute(
            "SELECT pg_advisory_unlock(%s)",
            (lock_id,),
        )

def get_elapsed_ms(start_time: float) -> int:
    return int(
        (time.monotonic() - start_time) * 1000
    )

def analyze_natural_speech(
    text: str,
    language: str,
):
    start_time = time.monotonic()

    text = normalize_text(text)

    if not text:
        return {
            "text": "",
            "language": language,
            "cues": [],
        }

    cache_key = create_cache_key(
        text=text,
        language=language,
        model=MODEL,
        prompt_version=PROMPT_VERSIONS[language],
    )

    # 1. First cache check
    cached = find_cached_analysis(cache_key)

    if cached is not None:
        print(
            f"[NaturalSpeech] CACHE HIT: {cache_key}"
        )

        save_request_log(
            cache_key=cache_key,
            language=language,
            normalized_text=text,
            cache_hit=True,
            status="success",
            response_time_ms=get_elapsed_ms(start_time),
        )

        return cached

    print(
        f"[NaturalSpeech] CACHE MISS: {cache_key}"
    )

    lock_id = create_lock_id(cache_key)

    with get_connection() as conn:
        acquired = acquire_cache_lock(
            conn,
            lock_id,
        )

        # 2. Lock timeout
        if not acquired:
            save_request_log(
                cache_key=cache_key,
                language=language,
                normalized_text=text,
                cache_hit=False,
                status="lock_timeout",
                response_time_ms=get_elapsed_ms(start_time),
            )

            raise TimeoutError(
                f"Natural Speech lock timeout: {cache_key}"
            )

        try:
            # 3. Double-check cache after acquiring lock
            cached = find_cached_analysis(
                cache_key,
                conn,
            )

            if cached is not None:
                print(
                    f"[NaturalSpeech] CACHE HIT AFTER LOCK: "
                    f"{cache_key}"
                )

                save_request_log(
                    cache_key=cache_key,
                    language=language,
                    normalized_text=text,
                    cache_hit=True,
                    status="success",
                    response_time_ms=get_elapsed_ms(start_time),
                )

                return cached

            # 4. Still MISS -> OpenAI
            print(
                f"[NaturalSpeech] OPENAI CALL: {cache_key}"
            )

            words = tokenize_words(text)

            try:
                result = call_openai(
                    text=text,
                    language=language,
                    words=words,
                )

            except Exception:
                save_request_log(
                    cache_key=cache_key,
                    language=language,
                    normalized_text=text,
                    cache_hit=False,
                    status="openai_error",
                    response_time_ms=get_elapsed_ms(start_time),
                )

                raise

            analysis = {
                "text": text,
                "language": language,
                "cues": [
                    cue.model_dump()
                    for cue in result.cues
                ],
            }

            save_cached_analysis(
                cache_key=cache_key,
                language=language,
                normalized_text=text,
                analysis=analysis,
                prompt_version=PROMPT_VERSIONS[language],
                model=MODEL,
                conn=conn,
            )

            conn.commit()

            # 5. Successful cache MISS
            save_request_log(
                cache_key=cache_key,
                language=language,
                normalized_text=text,
                cache_hit=False,
                status="success",
                response_time_ms=get_elapsed_ms(start_time),
            )

            return analysis

        finally:
            release_cache_lock(
                conn,
                lock_id,
            )