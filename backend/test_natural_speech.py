from pprint import pprint

from natural_speech import analyze_natural_speech

result = analyze_natural_speech(
    "Can you help me?",
    "en",
)

pprint(result)