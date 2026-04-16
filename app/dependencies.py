from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import Project, ProjectMember, Sprint, Task, User


def get_project_or_404(db: Session, project_id: int) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def get_user_or_404(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    return user


def get_sprint_or_404(db: Session, sprint_id: int) -> Sprint:
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if sprint is None:
        raise HTTPException(status_code=404, detail="Sprint not found")
    return sprint


def get_task_or_404(db: Session, task_id: int) -> Task:
    task = db.query(Task).filter(Task.id == task_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def is_project_member(db: Session, project_id: int, user_id: int) -> bool:
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id)
        .filter(ProjectMember.user_id == user_id)
        .first()
    )
    return membership is not None
