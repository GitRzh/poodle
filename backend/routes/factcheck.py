from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.llm_client import chat, LLMError
from services.prompts import factcheck_prompt
import json, re

router = APIRouter()

class FactCheckRequest(BaseModel):
    text:    str
    api_key: str = ""

@router.post("")
async def factcheck(req: FactCheckRequest):
    if not req.text.strip():
        raise HTTPException(400, "text is required")
    if not req.api_key:
        raise HTTPException(401, "No API key provided. Add your Groq key in Poodle settings.")
    prompt = factcheck_prompt(req.text[:2000])
    try:
        raw   = await chat([{"role": "user", "content": prompt}], api_key=req.api_key, temperature=0.1)
        clean = re.sub(r"```json|```", "", raw).strip()
        data  = json.loads(clean)
        return {
            "verdict": data.get("verdict", "unverifiable"),
            "reason":  data.get("reason", "")
        }
    except LLMError as e:
        raise HTTPException(e.status_code, e.message)
    except json.JSONDecodeError:
        raise HTTPException(500, "Model returned unexpected format")
    except Exception as e:
        raise HTTPException(500, str(e))