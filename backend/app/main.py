from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.api import auth, templates, template_sets, generate, employees, social_wages, companies, data_transfer


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="HR 合同系统 · 空数据离线版", version="1.0.0-local", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5313", "http://localhost:5313"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(templates.router)
app.include_router(template_sets.router)
app.include_router(generate.router)
app.include_router(employees.router)
app.include_router(social_wages.router)
app.include_router(companies.router)
app.include_router(data_transfer.router)


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "offline": True, "live_sync": False}
