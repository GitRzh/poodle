import httpx
from config import GROQ_API_KEY, GROQ_MODEL

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

async def chat(messages: list[dict], max_tokens: int = 1024, temperature: float = 0.3) -> str:
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not set in environment.")

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": GROQ_MODEL,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            }
        )
        res.raise_for_status()
        data = res.json()
        return data["choices"][0]["message"]["content"]
