from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import SprintStatus, TaskPriority, TaskStatus, TaskType, UserRole


class UserRegister(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    login: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: UserRole | None = None


class UserLogin(BaseModel):
    login: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class UserRead(BaseModel):
    id: int
    name: str
    login: str
    role: UserRole
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    login: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.developer


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserRead


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=3000)


class ProjectRead(BaseModel):
    id: int
    name: str
    description: str
    created_by_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProjectMemberAdd(BaseModel):
    user_id: int


class ProjectMemberRead(BaseModel):
    id: int
    project_id: int
    user: UserRead
    added_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SprintCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    goal: str = Field(default="", max_length=3000)
    start_date: date
    end_date: date
    status: SprintStatus = SprintStatus.planned


class SprintRead(BaseModel):
    id: int
    project_id: int
    name: str
    goal: str
    start_date: date
    end_date: date
    status: SprintStatus
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=3000)
    type: TaskType
    priority: TaskPriority = TaskPriority.medium
    assignee_id: int | None = None
    sprint_id: int | None = None
    duplicate_review_confirmed: bool = False
    duplicate_review_task_id: int | None = None


class TaskAssign(BaseModel):
    assignee_id: int


class TaskStatusUpdate(BaseModel):
    status: TaskStatus
    reported_spent_minutes: int | None = Field(default=None, ge=0, le=100_000)
    reported_spent_comment: str | None = Field(default=None, max_length=1000)


class TaskCommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class UserShort(BaseModel):
    id: int
    name: str
    role: UserRole

    model_config = ConfigDict(from_attributes=True)


class SprintShort(BaseModel):
    id: int
    name: str
    status: SprintStatus

    model_config = ConfigDict(from_attributes=True)


class TaskRead(BaseModel):
    id: int
    project_id: int
    sprint_id: int | None
    title: str
    description: str
    type: TaskType
    priority: TaskPriority
    status: TaskStatus
    created_by_id: int
    assignee_id: int | None
    archived_by_id: int | None
    archived_at: datetime | None
    tracked_seconds: int
    in_progress_started_at: datetime | None
    reported_seconds: int | None
    reported_comment: str | None
    created_at: datetime
    updated_at: datetime
    creator: UserShort
    assignee: UserShort | None
    archived_by: UserShort | None
    sprint: SprintShort | None

    model_config = ConfigDict(from_attributes=True)


class AuditLogRead(BaseModel):
    id: int
    task_id: int
    action: str
    details: str
    created_at: datetime
    actor: UserShort | None

    model_config = ConfigDict(from_attributes=True)


class TaskCommentRead(BaseModel):
    id: int
    task_id: int
    author_id: int
    content: str
    created_at: datetime
    author: UserShort

    model_config = ConfigDict(from_attributes=True)


class DashboardSummary(BaseModel):
    total_tasks: int
    by_status: dict[str, int]
    by_type: dict[str, int]


class DeveloperProjectSummary(BaseModel):
    project_id: int
    project_name: str
    total_tasks: int
    by_status: dict[str, int]


class DeveloperDashboardRead(BaseModel):
    assignee_id: int
    total_tasks: int
    active_tasks: int
    by_status: dict[str, int]
    by_project: list[DeveloperProjectSummary]
    tasks: list[TaskRead]


class TaskDurationEstimateRead(BaseModel):
    task_id: int
    hours: float
    days: float
    label: str
