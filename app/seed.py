from __future__ import annotations

from datetime import date

from .database import Base, SessionLocal, engine
from .models import Project, ProjectMember, Sprint, SprintStatus, Task, TaskPriority, TaskStatus, TaskType, User, UserRole
from .security import hash_password

DEMO_MANAGER_LOGIN = "manager"
DEMO_DEVELOPER_LOGIN = "developer"
DEMO_ADMIN_LOGIN = "admin"
DEMO_PASSWORD = "demo12345"


def _ensure_user(db, *, name: str, login: str, role: UserRole) -> User:
    user = db.query(User).filter(User.login == login).first()
    if user is None:
        user = User(
            name=name,
            login=login,
            role=role,
            password_hash=hash_password(DEMO_PASSWORD),
        )
        db.add(user)
        db.flush()
        return user

    updated = False
    if user.role != role:
        user.role = role
        updated = True
    if user.name != name:
        user.name = name
        updated = True
    if not user.password_hash:
        user.password_hash = hash_password(DEMO_PASSWORD)
        updated = True
    if updated:
        db.flush()
    return user


def _ensure_project(db, *, manager: User) -> Project:
    project = db.query(Project).filter(Project.name == "Hackathon Demo Project").first()
    if project is None:
        project = Project(
            name="Hackathon Demo Project",
            description="Demo space for Random Foresters's Task Tracker walkthrough",
            created_by_id=manager.id,
        )
        db.add(project)
        db.flush()
    return project


def _ensure_member(db, *, project_id: int, user_id: int) -> None:
    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id)
        .filter(ProjectMember.user_id == user_id)
        .first()
    )
    if member is None:
        db.add(ProjectMember(project_id=project_id, user_id=user_id))
        db.flush()


def _ensure_sprint(db, *, project_id: int) -> Sprint:
    sprint = (
        db.query(Sprint)
        .filter(Sprint.project_id == project_id)
        .filter(Sprint.name == "Sprint 1")
        .first()
    )
    if sprint is None:
        sprint = Sprint(
            project_id=project_id,
            name="Sprint 1",
            goal="Deliver MVP for demo day",
            start_date=date(2026, 4, 16),
            end_date=date(2026, 4, 23),
            status=SprintStatus.active,
        )
        db.add(sprint)
        db.flush()
    return sprint


def _ensure_task(
    db,
    *,
    project_id: int,
    sprint_id: int | None,
    title: str,
    description: str,
    task_type: TaskType,
    priority: TaskPriority,
    status: TaskStatus,
    created_by_id: int,
    assignee_id: int | None,
) -> None:
    task = (
        db.query(Task)
        .filter(Task.project_id == project_id)
        .filter(Task.title == title)
        .first()
    )
    if task is None:
        task = Task(
            project_id=project_id,
            sprint_id=sprint_id,
            title=title,
            description=description,
            type=task_type,
            priority=priority,
            status=status,
            created_by_id=created_by_id,
            assignee_id=assignee_id,
        )
        db.add(task)
        db.flush()
        return

    task.description = description
    task.type = task_type
    task.priority = priority
    task.status = status
    task.sprint_id = sprint_id
    task.assignee_id = assignee_id
    db.flush()


def seed_demo_data() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        manager = _ensure_user(
            db,
            name="Demo Manager",
            login=DEMO_MANAGER_LOGIN,
            role=UserRole.manager,
        )
        developer = _ensure_user(
            db,
            name="Demo Developer",
            login=DEMO_DEVELOPER_LOGIN,
            role=UserRole.developer,
        )
        admin = _ensure_user(
            db,
            name="Demo Admin",
            login=DEMO_ADMIN_LOGIN,
            role=UserRole.admin,
        )

        project = _ensure_project(db, manager=manager)
        _ensure_member(db, project_id=project.id, user_id=manager.id)
        _ensure_member(db, project_id=project.id, user_id=developer.id)
        _ensure_member(db, project_id=project.id, user_id=admin.id)

        sprint = _ensure_sprint(db, project_id=project.id)

        _ensure_task(
            db,
            project_id=project.id,
            sprint_id=sprint.id,
            title="Setup project skeleton",
            description="Prepare base API project and environment",
            task_type=TaskType.feature,
            priority=TaskPriority.medium,
            status=TaskStatus.closed,
            created_by_id=manager.id,
            assignee_id=developer.id,
        )
        _ensure_task(
            db,
            project_id=project.id,
            sprint_id=sprint.id,
            title="Implement JWT auth",
            description="Add register/login and JWT validation",
            task_type=TaskType.feature,
            priority=TaskPriority.high,
            status=TaskStatus.ready_for_acceptance,
            created_by_id=manager.id,
            assignee_id=developer.id,
        )
        _ensure_task(
            db,
            project_id=project.id,
            sprint_id=sprint.id,
            title="Fix sprint date validation bug",
            description="Handle incorrect start/end date inputs",
            task_type=TaskType.bug,
            priority=TaskPriority.high,
            status=TaskStatus.in_progress,
            created_by_id=manager.id,
            assignee_id=developer.id,
        )
        _ensure_task(
            db,
            project_id=project.id,
            sprint_id=sprint.id,
            title="Refactor task status transitions",
            description="Improve strict transition checks in backend",
            task_type=TaskType.tech_debt,
            priority=TaskPriority.medium,
            status=TaskStatus.selected,
            created_by_id=manager.id,
            assignee_id=developer.id,
        )
        _ensure_task(
            db,
            project_id=project.id,
            sprint_id=None,
            title="Write API usage guide",
            description="Prepare docs for manager and developer workflows",
            task_type=TaskType.documentation,
            priority=TaskPriority.low,
            status=TaskStatus.open,
            created_by_id=manager.id,
            assignee_id=None,
        )

        db.commit()
    finally:
        db.close()

    print("Demo data is ready.")
    print(f"Manager login: {DEMO_MANAGER_LOGIN} / {DEMO_PASSWORD}")
    print(f"Developer login: {DEMO_DEVELOPER_LOGIN} / {DEMO_PASSWORD}")
    print(f"Admin login: {DEMO_ADMIN_LOGIN} / {DEMO_PASSWORD}")


if __name__ == "__main__":
    seed_demo_data()
