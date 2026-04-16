from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routers import auth, projects, sprints, tasks, users


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Task Tracker Hackathon API",
    description="MVP service for task management with role-based workflow and strict status transitions",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(sprints.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Task Tracker Hackathon API. Open /docs for Swagger."}
