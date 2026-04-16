from collections import Counter
import re
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..dependencies import get_project_or_404, get_sprint_or_404, get_task_or_404, get_user_or_404, is_project_member
from ..models import AuditLog, ProjectMember, Task, TaskComment, TaskPriority, TaskStatus, TaskType, User, UserRole, utcnow_naive
from ..schemas import AuditLogRead, DashboardSummary, TaskAssign, TaskCommentCreate, TaskCommentRead, TaskCreate, TaskRead, TaskStatusUpdate
from ..security import get_current_user, require_roles

router = APIRouter(tags=["Tasks"], dependencies=[Depends(get_current_user)])

STOP_WORDS = {
    "a",
    "an",
    "and",
    "at",
    "by",
    "for",
    "from",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
    "без",
    "в",
    "во",
    "для",
    "и",
    "из",
    "к",
    "на",
    "не",
    "по",
    "под",
    "при",
    "с",
    "со",
    "что",
}

TOKEN_PATTERN = re.compile(r"[a-z0-9а-яё]+", re.IGNORECASE)

TITLE_EXACT_MATCH_THRESHOLD = 0.98
TITLE_STRONG_MATCH_THRESHOLD = 0.82
COMBINED_STRONG_MATCH_THRESHOLD = 0.76
KEYWORD_OVERLAP_STRONG_THRESHOLD = 0.66
WARNING_SIMILARITY_THRESHOLD = 0.55

ALLOWED_TRANSITIONS: dict[TaskStatus, set[TaskStatus]] = {
    TaskStatus.open: {TaskStatus.selected},
    TaskStatus.selected: {TaskStatus.in_progress},
    TaskStatus.in_progress: {TaskStatus.ready_for_acceptance},
    TaskStatus.ready_for_acceptance: {TaskStatus.closed},
    TaskStatus.closed: set(),
}


@dataclass(frozen=True)
class DuplicateSignal:
    task: Task
    title_similarity: float
    description_similarity: float
    keyword_overlap: float
    combined_score: float
    normalized_title_match: bool
    normalized_description_match: bool


def _task_query(db: Session):
    return db.query(Task).options(
        joinedload(Task.creator),
        joinedload(Task.assignee),
        joinedload(Task.archived_by),
        joinedload(Task.sprint),
    )


def _task_comments_query(db: Session):
    return db.query(TaskComment).options(joinedload(TaskComment.author))


def _ensure_task_access(db: Session, task: Task, user: User) -> None:
    if user.role in {UserRole.manager, UserRole.admin}:
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


def _tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    for raw in TOKEN_PATTERN.findall(text.lower()):
        if len(raw) <= 2:
            continue
        if raw in STOP_WORDS:
            continue
        tokens.append(raw)
    return tokens


def _normalized_exact_text(text: str) -> str:
    return " ".join(TOKEN_PATTERN.findall(text.lower()))


def _jaccard_similarity(left: set[str], right: set[str]) -> float:
    if not left and not right:
        return 1.0
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def _keyword_overlap(left: list[str], right: list[str]) -> float:
    if not left or not right:
        return 0.0
    left_counter = Counter(left)
    right_counter = Counter(right)
    overlap = 0
    for token in left_counter.keys() & right_counter.keys():
        overlap += min(left_counter[token], right_counter[token])
    return overlap / max(len(left), len(right))


def _duplicate_signal(candidate: Task, payload: TaskCreate) -> DuplicateSignal:
    payload_title_tokens = _tokenize(payload.title)
    payload_desc_tokens = _tokenize(payload.description)
    payload_all_tokens = payload_title_tokens + payload_desc_tokens

    candidate_title_tokens = _tokenize(candidate.title)
    candidate_desc_tokens = _tokenize(candidate.description)
    candidate_all_tokens = candidate_title_tokens + candidate_desc_tokens

    title_similarity = _jaccard_similarity(set(payload_title_tokens), set(candidate_title_tokens))
    description_similarity = _jaccard_similarity(set(payload_desc_tokens), set(candidate_desc_tokens))
    keyword_overlap = _keyword_overlap(payload_all_tokens, candidate_all_tokens)

    same_type_boost = 0.08 if candidate.type == payload.type else 0.0
    normalized_title_match = _normalized_exact_text(payload.title) == _normalized_exact_text(candidate.title)
    normalized_description_match = _normalized_exact_text(payload.description) == _normalized_exact_text(
        candidate.description
    )
    combined_score = (
        (title_similarity * 0.64)
        + (description_similarity * 0.18)
        + (keyword_overlap * 0.18)
        + same_type_boost
    )

    return DuplicateSignal(
        task=candidate,
        title_similarity=title_similarity,
        description_similarity=description_similarity,
        keyword_overlap=keyword_overlap,
        combined_score=min(combined_score, 1.0),
        normalized_title_match=normalized_title_match,
        normalized_description_match=normalized_description_match,
    )


def _is_confident_duplicate(signal: DuplicateSignal) -> bool:
    if signal.normalized_title_match and signal.normalized_description_match:
        return True
    if signal.title_similarity >= TITLE_EXACT_MATCH_THRESHOLD and signal.keyword_overlap >= 0.7:
        return True
    return (
        signal.title_similarity >= TITLE_STRONG_MATCH_THRESHOLD
        and signal.combined_score >= COMBINED_STRONG_MATCH_THRESHOLD
        and signal.keyword_overlap >= KEYWORD_OVERLAP_STRONG_THRESHOLD
    )


def _find_best_duplicate_signal(db: Session, project_id: int, payload: TaskCreate) -> DuplicateSignal | None:
    candidates = (
        db.query(Task)
        .filter(Task.project_id == project_id)
        .order_by(Task.updated_at.desc())
        .all()
    )

    if not candidates:
        return None

    ranked = sorted(
        (_duplicate_signal(candidate, payload) for candidate in candidates),
        key=lambda item: item.combined_score,
        reverse=True,
    )
    if not ranked:
        return None

    best = ranked[0]
    return best


def _format_similarity_warning(signal: DuplicateSignal) -> str:
    score = round(signal.combined_score * 100)
    return (
        "Suspiciously similar task detected "
        f"({score}%): #{signal.task.id} '{signal.task.title}'. "
        "Warning threshold: 55%."
    )


@router.post("/projects/{project_id}/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    project_id: int,
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.manager)),
) -> TaskRead:
    _ = get_project_or_404(db, project_id)

    best_duplicate = _find_best_duplicate_signal(db, project_id, payload)
    if best_duplicate is not None and _is_confident_duplicate(best_duplicate):
        raise HTTPException(
            status_code=409,
            detail=(
                "Possible duplicate task found: "
                f"#{best_duplicate.task.id} '{best_duplicate.task.title}' "
                f"(score={best_duplicate.combined_score:.2f})"
            ),
        )

    review_required = (
        best_duplicate is not None and best_duplicate.combined_score >= WARNING_SIMILARITY_THRESHOLD
    )
    review_confirmed = (
        payload.duplicate_review_confirmed
        and payload.duplicate_review_task_id is not None
        and best_duplicate is not None
        and payload.duplicate_review_task_id == best_duplicate.task.id
    )

    if review_required and not review_confirmed:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "duplicate_review_required",
                "message": _format_similarity_warning(best_duplicate),
                "task_id": best_duplicate.task.id,
                "task_title": best_duplicate.task.title,
                "similarity_percent": round(best_duplicate.combined_score * 100),
            },
        )

    if payload.duplicate_review_confirmed and not review_required:
        raise HTTPException(status_code=400, detail="Duplicate review confirmation is not required")
    if payload.duplicate_review_confirmed and payload.duplicate_review_task_id is None:
        raise HTTPException(status_code=400, detail="Duplicate review confirmation is invalid")

    if payload.assignee_id is not None:
        assignee = get_user_or_404(db, payload.assignee_id)
        if assignee.role not in {UserRole.developer, UserRole.admin}:
            raise HTTPException(status_code=400, detail="Task assignee must be a developer or admin")
        if not is_project_member(db, project_id, assignee.id):
            raise HTTPException(status_code=400, detail="Task assignee must be a member of this project")

    if payload.sprint_id is not None:
        sprint = get_sprint_or_404(db, payload.sprint_id)
        if sprint.project_id != project_id:
            raise HTTPException(status_code=400, detail="Sprint does not belong to this project")

    task_data = payload.model_dump(
        exclude={
            "duplicate_review_confirmed",
            "duplicate_review_task_id",
        }
    )
    task = Task(project_id=project_id, created_by_id=current_user.id, **task_data)
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
    archived: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TaskRead]:
    query = _task_query(db)

    if current_user.role == UserRole.developer:
        query = query.join(ProjectMember, ProjectMember.project_id == Task.project_id).filter(
            ProjectMember.user_id == current_user.id
        )
    if archived:
        query = query.filter(Task.archived_at.is_not(None))
    else:
        query = query.filter(Task.archived_at.is_(None))

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

    if assignee.role not in {UserRole.developer, UserRole.admin}:
        raise HTTPException(status_code=400, detail="Task assignee must be a developer or admin")
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

    if current_user.role == UserRole.admin:
        previous = task.status
        task.status = payload.status
        _audit(db, task.id, current_user.id, "status_changed", f"{previous.value} -> {payload.status.value}")
        db.commit()
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


@router.post("/tasks/{task_id}/archive", response_model=TaskRead)
def archive_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.manager)),
) -> TaskRead:
    task = get_task_or_404(db, task_id)

    if task.status != TaskStatus.closed:
        raise HTTPException(status_code=400, detail="Only closed task can be archived")

    if task.archived_at is not None:
        return _task_query(db).filter(Task.id == task.id).first()

    task.archived_at = utcnow_naive()
    task.archived_by_id = current_user.id
    _audit(db, task.id, current_user.id, "task_archived", "Task moved to archive")

    db.commit()
    return _task_query(db).filter(Task.id == task.id).first()


@router.post("/tasks/{task_id}/restore", response_model=TaskRead)
def restore_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.manager)),
) -> TaskRead:
    task = get_task_or_404(db, task_id)

    if task.archived_at is None:
        return _task_query(db).filter(Task.id == task.id).first()

    task.archived_at = None
    task.archived_by_id = None
    _audit(db, task.id, current_user.id, "task_restored", "Task restored from archive")

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


@router.get("/tasks/{task_id}/comments", response_model=list[TaskCommentRead])
def get_task_comments(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TaskComment]:
    task = get_task_or_404(db, task_id)
    _ensure_task_access(db, task, current_user)

    return (
        _task_comments_query(db)
        .filter(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at.asc())
        .all()
    )


@router.post("/tasks/{task_id}/comments", response_model=TaskCommentRead, status_code=status.HTTP_201_CREATED)
def add_task_comment(
    task_id: int,
    payload: TaskCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskComment:
    task = get_task_or_404(db, task_id)
    _ensure_task_access(db, task, current_user)

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")

    comment = TaskComment(
        task_id=task.id,
        author_id=current_user.id,
        content=content,
    )
    db.add(comment)
    db.flush()
    _audit(db, task.id, current_user.id, "comment_added", f"comment_id={comment.id}")

    db.commit()
    return _task_comments_query(db).filter(TaskComment.id == comment.id).first()


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(
    project_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardSummary:
    query = db.query(Task).filter(Task.archived_at.is_(None))
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
