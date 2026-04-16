from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_project_or_404, is_project_member
from ..models import Sprint, User, UserRole
from ..schemas import SprintCreate, SprintRead
from ..security import get_current_user, require_roles

router = APIRouter(tags=["Sprints"], dependencies=[Depends(get_current_user)])


@router.post("/projects/{project_id}/sprints", response_model=SprintRead, status_code=status.HTTP_201_CREATED)
def create_sprint(
    project_id: int,
    payload: SprintCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> Sprint:
    _ = get_project_or_404(db, project_id)

    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="end_date must be greater than or equal to start_date")

    sprint = Sprint(project_id=project_id, **payload.model_dump())
    db.add(sprint)
    db.commit()
    db.refresh(sprint)
    return sprint


@router.get("/projects/{project_id}/sprints", response_model=list[SprintRead])
def list_sprints(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Sprint]:
    _ = get_project_or_404(db, project_id)
    if current_user.role == UserRole.developer and not is_project_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Project access denied")

    return db.query(Sprint).filter(Sprint.project_id == project_id).order_by(Sprint.start_date.asc()).all()
