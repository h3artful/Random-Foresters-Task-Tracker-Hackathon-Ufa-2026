from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..dependencies import get_project_or_404, get_sprint_or_404, get_task_or_404, get_user_or_404, is_project_member
from ..models import AuditLog, ProjectMember, Task, TaskPriority, TaskStatus, TaskType, User, UserRole
from ..schemas import AuditLogRead, DashboardSummary, TaskAssign, TaskCreate, TaskRead, TaskStatusUpdate
from ..security import get_current_user, require_roles

router = APIRouter(tags=["Tasks"], dependencies=[Depends(get_current_user)])

ALLOWED_TRANSITIONS: dict[TaskStatus, set[TaskStatus]] = {
    TaskStatus.open: {TaskStatus.selected},
    TaskStatus.selected: {TaskStatus.in_progress},
    TaskStatus.in_progress: {TaskStatus.ready_for_acceptance},
    TaskStatus.ready_for_acceptance: {TaskStatus.closed},
    TaskStatus.closed: set(),
}


def _task_query(db: Session):
    return db.query(Task).options(
        joinedload(Task.creator),
        joinedload(Task.assignee),
        joinedload(Task.sprint),
    )


def _ensure_task_access(db: Session, task: Task, user: User) -> None:
    if user.role == UserRole.manager:
        return
    if not is_project_member(db, task.project_id, user.id):
        raise HTTPException(status_code=403, detail="Task access denied")


def _audit(db: Session, task_id: int, actor_id: int | None, action: str, details: str) -> None:
    db.add(AuditLog(task_id=task_id, actor_id=actor_id, action=action, details=details))


def _validate_transition(current: TaskStatus, target: TaskStatus) -> None:
    if target not in ALLOWED_TRANSITIONS[current]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status transition: {current.value} -> {target.value}",
        )


@router.post("/projects/{project_id}/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    project_id: int,
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.manager)),
) -> TaskRead:
    _ = get_project_or_404(db, project_id)

    if payload.assignee_id is not None:
        assignee = get_user_or_404(db, payload.assignee_id)
        if assignee.role != UserRole.developer:
            raise HTTPException(status_code=400, detail="Task assignee must be a developer")
        if not is_project_member(db, project_id, assignee.id):
            raise HTTPException(status_code=400, detail="Task assignee must be a member of this project")

    if payload.sprint_id is not None:
        sprint = get_sprint_or_404(db, payload.sprint_id)
        if sprint.project_id != project_id:
            raise HTTPException(status_code=400, detail="Sprint does not belong to this project")

    task = Task(project_id=project_id, created_by_id=current_user.id, **payload.model_dump())
    db.add(task)
    db.flush()

    _audit(db, task.id, current_user.id, "task_created", f"Task '{task.title}' created")

    db.commit()
    return _task_query(db).filter(Task.id == task.id).first()


@router.get("/tasks", response_model=list[TaskRead])
def list_tasks(
    project_id: int | None = Query(default=None),
    sprint_id: int | None = Query(default=None),
    status_filter: TaskStatus | None = Query(default=None, alias="status"),
    type_filter: TaskType | None = Query(default=None, alias="type"),
    priority: TaskPriority | None = Query(default=None),
    assignee_id: int | None = Query(default=None),
    search: str | None = Query(default=None, min_length=2),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TaskRead]:
    query = _task_query(db)

    if current_user.role == UserRole.developer:
        query = query.join(ProjectMember, ProjectMember.project_id == Task.project_id).filter(
            ProjectMember.user_id == current_user.id
        )

    if project_id is not None:
        query = query.filter(Task.project_id == project_id)
    if sprint_id is not None:
        query = query.filter(Task.sprint_id == sprint_id)
    if status_filter is not None:
        query = query.filter(Task.status == status_filter)
    if type_filter is not None:
        query = query.filter(Task.type == type_filter)
    if priority is not None:
        query = query.filter(Task.priority == priority)
    if assignee_id is not None:
        query = query.filter(Task.assignee_id == assignee_id)
    if search:
        like_pattern = f"%{search.strip()}%"
        query = query.filter((Task.title.ilike(like_pattern)) | (Task.description.ilike(like_pattern)))

    return query.order_by(Task.updated_at.desc()).all()


@router.get("/tasks/{task_id}", response_model=TaskRead)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskRead:
    task = _task_query(db).filter(Task.id == task_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    _ensure_task_access(db, task, current_user)
    return task


@router.patch("/tasks/{task_id}/assign", response_model=TaskRead)
def assign_task(
    task_id: int,
    payload: TaskAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.manager)),
) -> TaskRead:
    task = get_task_or_404(db, task_id)
    assignee = get_user_or_404(db, payload.assignee_id)

    if assignee.role != UserRole.developer:
        raise HTTPException(status_code=400, detail="Task assignee must be a developer")
    if not is_project_member(db, task.project_id, assignee.id):
        raise HTTPException(status_code=400, detail="Task assignee must be a member of this project")
    if task.status == TaskStatus.closed:
        raise HTTPException(status_code=400, detail="Closed task cannot be reassigned")

    task.assignee_id = assignee.id
    _audit(db, task.id, current_user.id, "task_assigned", f"assignee_id={assignee.id}")
    db.commit()

    return _task_query(db).filter(Task.id == task.id).first()


@router.patch("/tasks/{task_id}/status", response_model=TaskRead)
def update_task_status(
    task_id: int,
    payload: TaskStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskRead:
    task = get_task_or_404(db, task_id)
    _ensure_task_access(db, task, current_user)

    if task.status == payload.status:
        return _task_query(db).filter(Task.id == task.id).first()

    _validate_transition(task.status, payload.status)

    if current_user.role == UserRole.manager:
        allowed_manager_targets = {TaskStatus.selected, TaskStatus.closed}
        if payload.status not in allowed_manager_targets:
            raise HTTPException(status_code=403, detail="Manager cannot perform this transition")
        if payload.status == TaskStatus.closed and task.status != TaskStatus.ready_for_acceptance:
            raise HTTPException(status_code=400, detail="Task can be closed only from ready_for_acceptance")

    if current_user.role == UserRole.developer:
        allowed_developer_targets = {
            TaskStatus.selected,
            TaskStatus.in_progress,
            TaskStatus.ready_for_acceptance,
        }
        if payload.status not in allowed_developer_targets:
            raise HTTPException(status_code=403, detail="Developer cannot perform this transition")

        if payload.status == TaskStatus.selected:
            if task.assignee_id is None:
                task.assignee_id = current_user.id
            elif task.assignee_id != current_user.id:
                raise HTTPException(status_code=403, detail="Task assigned to another developer")
        else:
            if task.assignee_id != current_user.id:
                raise HTTPException(status_code=403, detail="Only assignee can progress this task")

    previous = task.status
    task.status = payload.status
    _audit(db, task.id, current_user.id, "status_changed", f"{previous.value} -> {payload.status.value}")

    db.commit()
    return _task_query(db).filter(Task.id == task.id).first()


@router.get("/tasks/{task_id}/history", response_model=list[AuditLogRead])
def get_task_history(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AuditLog]:
    task = get_task_or_404(db, task_id)
    _ensure_task_access(db, task, current_user)

    return (
        db.query(AuditLog)
        .options(joinedload(AuditLog.actor))
        .filter(AuditLog.task_id == task_id)
        .order_by(AuditLog.created_at.desc())
        .all()
    )


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(
    project_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardSummary:
    query = db.query(Task)
    if project_id is not None:
        query = query.filter(Task.project_id == project_id)

    tasks = query.all()
    if current_user.role == UserRole.developer:
        tasks = [task for task in tasks if is_project_member(db, task.project_id, current_user.id)]

    by_status = Counter(task.status.value for task in tasks)
    by_type = Counter(task.type.value for task in tasks)

    return DashboardSummary(
        total_tasks=len(tasks),
        by_status=dict(by_status),
        by_type=dict(by_type),
    )
