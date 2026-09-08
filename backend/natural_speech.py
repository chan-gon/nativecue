import os
import hashlib
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

def create_cache_key(
    text: str,
    language: str,
    model: str,
    prompt_version: str,
) -> str:
    source = "|".join([language, model, prompt_version, text,])

    return hashlib.sha256(source.encode("utf-8")).hexdigest()

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
):
    with get_connection() as conn:
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

        if row is None:
            return None

        return row[0]

def save_cached_analysis(
    cache_key: str,
    language: str,
    normalized_text: str,
    analysis: dict,
    prompt_version: str,
    model: str,
):
    with get_connection() as conn:
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
                VALUES (
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s
                )
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

        conn.commit()


def analyze_natural_speech(
    text: str,
    language: str,
):
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

    cached = find_cached_analysis(
        cache_key
    )

    if cached is not None:
        print (f"[NaturalSpeech] CACHE HIT: {cache_key}")
        return cached
    print(f"[NaturalSpeech] CACHE MISS: {cache_key}")

    words = tokenize_words(text)

    result = call_openai(
        text=text,
        language=language,
        words=words,
    )

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
    )

    return analysis