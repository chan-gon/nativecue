import spacy

nlp_en = spacy.load("en_core_web_sm")
nlp_fr = spacy.load("fr_core_news_sm")

def analyze_text(text: str, language: str):
    if language == "en":
        nlp = nlp_en
    elif language == "fr":
        nlp = nlp_fr
    else:
        return {"error": "Unsupported language"}

    doc = nlp(text)

    chunks = []

    for token in doc:
        subtree = [child.text for child in token.subtree]
        # print(token.text, "->", subtree)
        # description = spacy.explain(token.dep_) or ""
        # print(
        #     f"{token.text:12} "
        #     f"{token.dep_:12} "
        #     f"{token.head.text:12} "
        #     f"{str(subtree)}"
        # )


        # advcl 체크 및 subtree 추출 후 chunks 배열에 추가
        if token.dep_ == "advcl":
            # print("advcl token:", token.text)
            # print("advcl index:", token.i)
            # print("start:", token.left_edge.text, token.left_edge.i)
            # print("end:", token.right_edge.text, token.right_edge.i)
            # print()
            start_idx = token.left_edge.i
            left = doc[:start_idx].text
            right = doc[start_idx:].text
            chunks = [left, right]

            print(chunks)

    return {
        "text": text,
        "language": language,
        "chunks": chunks,
    }