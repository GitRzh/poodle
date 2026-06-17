from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.llm_client import chat
from services.prompts import translate_prompt
import json

router = APIRouter()

class TranslateRequest(BaseModel):
    text: str
    lang: str = "Bengali"

@router.post("")
async def translate(req: TranslateRequest):
    if not req.text.strip():
        raise HTTPException(400, "text is required")
    prompt = translate_prompt(req.text[:4000], req.lang)
    try:
        raw = await chat([{"role": "user", "content": prompt}])
        parts = raw.split("NOTE:", 1)
        translation = parts[0].strip()
        note = parts[1].strip() if len(parts) > 1 else None
        return {
            "translation": translation,
            "note": note if note and note != "No special notes." else None
        }
    except Exception as e:
        raise HTTPException(500, str(e))
