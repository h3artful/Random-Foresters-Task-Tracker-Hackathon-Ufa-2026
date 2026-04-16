from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..dependencies import get_project_or_404, get_user_or_404, is_project_member
from ..models import Project, ProjectMember, User, UserRole
from ..schemas import ProjectCreate, ProjectMemberAdd, ProjectMemberRead, ProjectRead
from ..security import get_current_user, require_roles

router = APIRouter(prefix="/projects", tags=["Projects"], dependencies=[Depends(get_current_user)])


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.manager)),
) -> Project:
    project = Project(
        name=payload.name,
        description=payload.description,
        created_by_id=current_user.id,
    )
    db.add(project)
    db.flush()

    db.add(ProjectMember(project_id=project.id, user_id=current_user.id))

    db.commit()
    db.refresh(project)
    return project


@router.get("", response_model=list[ProjectRead])
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Project]:
    query = db.query(Project)
    if current_user.role in {UserRole.manager, UserRole.admin}:
        return query.order_by(Project.created_at.desc()).all()

    return (
        query.join(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(ProjectMember.user_id == current_user.id)
        .order_by(Project.created_at.desc())
        .all()
    )


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Project:
    project = get_project_or_404(db, project_id)
    if current_user.role == UserRole.developer and not is_project_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Project access denied")
    return project


@router.post("/{project_id}/members", response_model=ProjectMemberRead, status_code=status.HTTP_201_CREATED)
def add_project_member(
    project_id: int,
    payload: ProjectMemberAdd,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> ProjectMember:
    _ = get_project_or_404(db, project_id)
    user = get_user_or_404(db, payload.user_id)
    if user.role not in {UserRole.developer, UserRole.admin}:
        raise HTTPException(status_code=400, detail="Only developer or admin can be assigned to a project")

    member = ProjectMember(project_id=project_id, user_id=payload.user_id)
    db.add(member)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="User is already a project member")

    return (
        db.query(ProjectMember)
        .options(joinedload(ProjectMember.user))
        .filter(ProjectMember.id == member.id)
        .first()
    )


@router.get("/{project_id}/members", response_model=list[ProjectMemberRead])
def list_project_members(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ProjectMember]:
    _ = get_project_or_404(db, project_id)
    if current_user.role == UserRole.developer and not is_project_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Project access denied")

    return (
        db.query(ProjectMember)
        .options(joinedload(ProjectMember.user))
        .filter(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.id.asc())
        .all()
    )
