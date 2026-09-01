import spacy
from phonemizer import phonemize

nlp_en = spacy.load("en_core_web_sm")
nlp_fr = spacy.load("fr_core_news_sm")


def analyze_text(text: str, language: str):
    if language == "en":
        nlp = nlp_en
        phoneme_language = "en-us"
    elif language == "fr":
        nlp = nlp_fr
        phoneme_language = "fr-fr"
    else:
        return {"error": "Unsupported language"}

    text = " ".join(text.split())

    if not text:
        return {
            "text": "",
            "language": language,
            "ipa": "",
            "words": [],
        }

    doc = nlp(text)

    sentence_ipa = phonemize(
        text,
        language=phoneme_language,
        backend="espeak",
        with_stress=True,
    ).strip()

    words = []

    for token in doc:
        if token.is_punct:
            continue

        word_ipa = phonemize(
            token.text,
            language=phoneme_language,
            backend="espeak",
            with_stress=True,
        ).strip()

        words.append({
            "text": token.text,
            "ipa": word_ipa,
        })

    return {
        "text": text,
        "language": language,
        "ipa": sentence_ipa,
        "words": words,
    }