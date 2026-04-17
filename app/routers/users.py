from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, UserRole
from ..schemas import UserCreate, UserRead
from ..security import hash_password, require_roles
from ..services.user_creation import create_user_record

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> list[User]:
    return db.query(User).order_by(User.name.asc()).all()


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> User:
    existing = db.query(User).filter(User.login == payload.login).first()
    if existing is not None:
        raise HTTPException(status_code=400, detail="A user with this login already exists")

    return create_user_record(
        db,
        name=payload.name,
        login=payload.login,
        role=payload.role,
        password_hash=hash_password(payload.password),
    )
