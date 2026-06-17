from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.llm_client import chat
from services.prompts import factcheck_prompt
import json, re

router = APIRouter()

class FactCheckRequest(BaseModel):
    text: str

@router.post("")
async def factcheck(req: FactCheckRequest):
    if not req.text.strip():
        raise HTTPException(400, "text is required")
    prompt = factcheck_prompt(req.text[:2000])
    try:
        raw = await chat([{"role": "user", "content": prompt}], temperature=0.1)
        clean = re.sub(r"```json|```", "", raw).strip()
        data  = json.loads(clean)
        return {
            "verdict": data.get("verdict", "unverifiable"),
            "reason":  data.get("reason", "")
        }
    except json.JSONDecodeError:
        raise HTTPException(500, "Model returned unexpected format")
    except Exception as e:
        raise HTTPException(500, str(e))
