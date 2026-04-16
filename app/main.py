from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from .database import Base, engine
from .routers import auth, projects, sprints, tasks, users

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"


def ensure_legacy_schema() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    if "users" in table_names:
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        with engine.begin() as connection:
            if "login" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN login VARCHAR(255)"))
            if "email" in user_columns:
                connection.execute(text("UPDATE users SET login = email WHERE login IS NULL OR login = ''"))
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_login ON users (login)"))

    if "tasks" in table_names:
        columns = {column["name"] for column in inspector.get_columns("tasks")}
        with engine.begin() as connection:
            if "archived_by_id" not in columns:
                connection.execute(text("ALTER TABLE tasks ADD COLUMN archived_by_id INTEGER"))
                connection.execute(text("CREATE INDEX IF NOT EXISTS ix_tasks_archived_by_id ON tasks (archived_by_id)"))
            if "archived_at" not in columns:
                connection.execute(text("ALTER TABLE tasks ADD COLUMN archived_at DATETIME"))
                connection.execute(text("CREATE INDEX IF NOT EXISTS ix_tasks_archived_at ON tasks (archived_at)"))
            if "tracked_seconds" not in columns:
                connection.execute(text("ALTER TABLE tasks ADD COLUMN tracked_seconds INTEGER NOT NULL DEFAULT 0"))
            if "in_progress_started_at" not in columns:
                connection.execute(text("ALTER TABLE tasks ADD COLUMN in_progress_started_at DATETIME"))
            if "reported_seconds" not in columns:
                connection.execute(text("ALTER TABLE tasks ADD COLUMN reported_seconds INTEGER"))
            if "reported_comment" not in columns:
                connection.execute(text("ALTER TABLE tasks ADD COLUMN reported_comment TEXT"))
            connection.execute(
                text(
                    """
                    UPDATE tasks
                    SET priority = CASE lower(priority)
                        WHEN 'trivial' THEN 'Trivial'
                        WHEN 'minor' THEN 'Minor'
                        WHEN 'low' THEN 'Low'
                        WHEN 'medium' THEN 'Medium'
                        WHEN 'major' THEN 'Major'
                        WHEN 'high' THEN 'High'
                        WHEN 'critical' THEN 'Critical'
                        WHEN 'blocker' THEN 'Blocker'
                        ELSE priority
                    END
                    WHERE lower(priority) IN ('trivial', 'minor', 'low', 'medium', 'major', 'high', 'critical', 'blocker')
                    """
                )
            )
            connection.execute(text("UPDATE tasks SET tracked_seconds = 0 WHERE tracked_seconds IS NULL"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_legacy_schema()
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

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def root() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
