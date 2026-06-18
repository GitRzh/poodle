import httpx

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


class LLMError(Exception):
    """Raised when the Groq call fails. Carries the HTTP status the
    route should actually return, instead of everything collapsing
    into a generic 500."""
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(message)


async def chat(messages: list[dict], api_key: str, max_tokens: int = 1024, temperature: float = 0.3) -> str:
    if not api_key:
        raise LLMError(401, "No API key provided. Add your Groq key in Poodle settings.")

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            res = await client.post(
                GROQ_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.1-8b-instant",
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens
                }
            )
            res.raise_for_status()
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if status == 429:
                raise LLMError(429, "Groq's free-tier rate limit was hit. Wait a moment and try again.") from e
            if status == 401:
                raise LLMError(401, "Groq rejected this API key. Check it in Poodle settings.") from e
            raise LLMError(502, f"Groq returned an error ({status}).") from e
        except httpx.RequestError as e:
            raise LLMError(502, "Couldn't reach Groq — check your connection.") from e

        return res.json()["choices"][0]["message"]["content"]