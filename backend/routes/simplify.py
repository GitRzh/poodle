from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.llm_client import chat
from services.prompts import simplify_prompt

router = APIRouter()

class SimplifyRequest(BaseModel):
    text:    str
    level:   str = "simple"
    api_key: str = ""

@router.post("")
async def simplify(req: SimplifyRequest):
    if not req.text.strip():
        raise HTTPException(400, "text is required")
    if not req.api_key:
        raise HTTPException(401, "No API key provided. Add your Groq key in Poodle settings.")
    prompt = simplify_prompt(req.text[:4000], req.level)
    try:
        result = await chat([{"role": "user", "content": prompt}], api_key=req.api_key)
        return {"result": result}
    except Exception as e:
        raise HTTPException(500, str(e))