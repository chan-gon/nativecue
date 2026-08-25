from fastapi import FastAPI
from pydantic import BaseModel

from analyzer import analyze_text

app = FastAPI()

#  Define data to send from user to server
class TextRequest(BaseModel):
    text: str
    language: str = "en"

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.post("/analyze")
def analyze(request: TextRequest):
    result = analyze_text(
        request.text,
        request.language
    )

    return result