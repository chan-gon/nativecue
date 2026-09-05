from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from analyzer import analyze_text
from natural_speech import analyze_natural_speech

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

class TextRequest(BaseModel):
    text: str
    language: str = "en"

class AnalyzeRequest(BaseModel):
    text: str
    language: str

@app.get("/")
async def root():
    return {"message": "NativeCue API"}

@app.post("/analyze")
def analyze(request: TextRequest):
    return analyze_text(request.text, request.language)

@app.post("/natural_speech")
def natural_speech(request: AnalyzeRequest):
    return analyze_natural_speech(
        request.text,
        request.language,
    )