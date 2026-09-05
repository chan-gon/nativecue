import string

from phonemizer import phonemize


def normalize_text(text: str) -> str:
    """
    Normalize whitespace in the input text.

    Example:
        "  Can   you help me?  "
        -> "Can you help me?"
    """
    return " ".join(text.split())


def tokenize_words(text: str) -> list[str]:
    """
    Tokenize text using the same rule used by the pronunciation analyzer.

    Example:
        "I would've done it."
        -> ["I", "would've", "done", "it"]

    Keeping this logic in one function ensures that pronunciation
    word indexes and Natural Speech cue indexes stay aligned.
    """
    words = []

    for raw_word in text.split():
        word = raw_word.strip(string.punctuation)

        if word:
            words.append(word)

    return words


def analyze_text(text: str, language: str):
    if language == "en":
        phoneme_language = "en-us"
    elif language == "fr":
        phoneme_language = "fr-fr"
    else:
        return {"error": "Unsupported language"}

    text = normalize_text(text)

    if not text:
        return {
            "text": "",
            "language": language,
            "ipa": "",
            "words": [],
        }

    sentence_ipa = phonemize(
        text,
        language=phoneme_language,
        backend="espeak",
        with_stress=True,
    ).strip()

    words = []

    for word in tokenize_words(text):
        word_ipa = phonemize(
            word,
            language=phoneme_language,
            backend="espeak",
            with_stress=True,
        ).strip()

        words.append({
            "text": word,
            "ipa": word_ipa,
        })

    return {
        "text": text,
        "language": language,
        "ipa": sentence_ipa,
        "words": words,
    }