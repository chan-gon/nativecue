import os
import httpx

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Literal
from analyzer import analyze_text

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LIBRETRANSLATE_URL = os.getenv(
    "LIBRETRANSLATE_URL",
    "http://127.0.0.1:5000",
)

class TextRequest(BaseModel):
    text: str
    language: str = "en"

class AnalyzeRequest(BaseModel):
    text: str
    language: str

class TranslateRequest(BaseModel):
    text: str
    source_language: Literal["en", "fr"]
    target_language: Literal["en", "fr"]

@app.get("/")
async def root():
    return {"message": "NativeCue API"}

@app.post("/analyze")
def analyze(request: TextRequest):
    return analyze_text(request.text, request.language)

@app.post("/translate")
async def translate(request: TranslateRequest):
    if request.source_language == request.target_language:
        raise HTTPException(
            status_code=400,
            detail="Source and target language must be different.",
        )

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{LIBRETRANSLATE_URL}/translate",
                data={
                    "q": request.text,
                    "source": request.source_language,
                    "target": request.target_language,
                    "format": "text",
                },
            )
            response.raise_for_status()

    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=500,
            detail="LibreTranslate is unavailable.",
        ) from error

    result = response.json()

    return {
        "text": request.text,
        "translation": result["translatedText"],
        "source_language": request.source_language,
        "target_language": request.target_language,
    }