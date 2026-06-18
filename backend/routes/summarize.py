import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.llm_client import chat, LLMError
from services.prompts import summarize_prompt

router = APIRouter()

# Stopgap: strips a model-added intro line like "Here's a summary of the
# page in bullet points:" that sometimes precedes the actual content.
# The real fix belongs in summarize_prompt() — ask it not to add one.
_PREAMBLE_RE = re.compile(r"^\s*(here'?s|here is)\b.{0,120}?summary.{0,60}?:\s*", re.IGNORECASE)


class SummarizeRequest(BaseModel):
    text:    str
    length:  str = "medium"
    format:  str = "paragraph"
    api_key: str = ""


@router.post("")
async def summarize(req: SummarizeRequest):
    if not req.text.strip():
        raise HTTPException(400, "text is required")
    if not req.api_key:
        raise HTTPException(401, "No API key provided. Add your Groq key in Poodle settings.")
    prompt = summarize_prompt(req.text[:4000], req.length, req.format)
    try:
        result = await chat([{"role": "user", "content": prompt}], api_key=req.api_key, max_tokens=512)
        result = _PREAMBLE_RE.sub("", result).strip()
        return {"result": result}
    except LLMError as e:
        raise HTTPException(e.status_code, e.message)
    except Exception as e:
        raise HTTPException(500, str(e))