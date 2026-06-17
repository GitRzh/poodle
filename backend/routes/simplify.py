from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.llm_client import chat
from services.prompts import simplify_prompt

router = APIRouter()

class SimplifyRequest(BaseModel):
    text:  str
    level: str = "simple"   # child | simple | teen

@router.post("")
async def simplify(req: SimplifyRequest):
    if not req.text.strip():
        raise HTTPException(400, "text is required")
    prompt = simplify_prompt(req.text[:4000], req.level)
    try:
        result = await chat([{"role": "user", "content": prompt}])
        return {"result": result}
    except Exception as e:
        raise HTTPException(500, str(e))
