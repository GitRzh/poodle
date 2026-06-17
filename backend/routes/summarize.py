from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.llm_client import chat
from services.prompts import summarize_prompt

router = APIRouter()

class SummarizeRequest(BaseModel):
    text:   str
    length: str = "medium"   # short | medium | full
    format: str = "paragraph" # paragraph | bullets

@router.post("")
async def summarize(req: SummarizeRequest):
    if not req.text.strip():
        raise HTTPException(400, "text is required")
    prompt = summarize_prompt(req.text[:8000], req.length, req.format)
    try:
        result = await chat([{"role": "user", "content": prompt}])
        return {"result": result}
    except Exception as e:
        raise HTTPException(500, str(e))
