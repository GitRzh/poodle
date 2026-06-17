from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import summarize, simplify, translate, factcheck, domain_age

app = FastAPI(title="Poodle API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(summarize.router,   prefix="/summarize",   tags=["summarize"])
app.include_router(simplify.router,    prefix="/simplify",    tags=["simplify"])
app.include_router(translate.router,   prefix="/translate",   tags=["translate"])
app.include_router(factcheck.router,   prefix="/factcheck",   tags=["factcheck"])
app.include_router(domain_age.router,  prefix="/domain-age",  tags=["domain-age"])

@app.get("/")
def health():
    return {"status": "ok", "version": "3.0.0"}
