from fastapi import APIRouter, Query
from datetime import datetime, timezone
import httpx, re, socket

router = APIRouter()

async def get_rdap_age(domain: str) -> float | None:
    async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
        try:
            res = await client.get(f"https://rdap.org/domain/{domain}")
            if res.status_code == 200:
                data = res.json()
                for event in data.get("events", []):
                    if event.get("eventAction") in ("registration", "registered"):
                        raw = event["eventDate"].rstrip("Z")
                        try:
                            dt = datetime.fromisoformat(raw).replace(tzinfo=timezone.utc)
                        except ValueError:
                            dt = datetime.strptime(raw[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                        return round((datetime.now(timezone.utc) - dt).days / 365.25, 2)
        except Exception:
            pass

    # Fallback: whoisjson
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            res = await client.get(f"https://whoisjson.com/api/v1/whois?domain={domain}",
                                   headers={"Accept": "application/json"})
            if res.status_code == 200:
                data = res.json()
                created = data.get("created", "") or data.get("creation_date", "")
                if created:
                    dt = datetime.fromisoformat(str(created)[:19]).replace(tzinfo=timezone.utc)
                    return round((datetime.now(timezone.utc) - dt).days / 365.25, 2)
    except Exception:
        pass

    return None

def get_tld_category(domain: str) -> str:
    tld = domain.rsplit(".", 1)[-1].lower()
    cats = {
        "gov": "Government", "edu": "Education", "mil": "Military",
        "org": "Organisation", "com": "Commercial", "net": "Network",
        "io": "Tech / Startup", "ac": "Academic", "co": "Commercial"
    }
    return cats.get(tld, f".{tld} domain")

@router.get("")
async def get_domain_age(domain: str = Query(...)):
    domain = re.sub(r"^www\.", "", domain.lower().strip()).split(":")[0].split("/")[0]
    age    = await get_rdap_age(domain)
    tld_cat = get_tld_category(domain)

    return {
        "domain":       domain,
        "age_years":    age,
        "new":          age < 0.5 if age is not None else None,
        "tld_category": tld_cat,
    }