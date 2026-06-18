import httpx

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

async def chat(messages: list[dict], api_key: str, max_tokens: int = 1024, temperature: float = 0.3) -> str:
    if not api_key:
        raise ValueError("No API key provided. Add your Groq key in Poodle settings.")

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "llama3-8b-8192",
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            }
        )
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"]