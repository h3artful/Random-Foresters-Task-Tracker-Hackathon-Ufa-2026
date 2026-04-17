from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from urllib.parse import parse_qs

from ..database import get_db
from ..models import User, UserRole
from ..schemas import TokenResponse, UserRead, UserRegister
from ..security import create_access_token, get_current_user, hash_password, verify_password
from ..services.user_creation import create_user_record

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)) -> User:
    user_count = db.query(User).count()
    if user_count > 0:
        raise HTTPException(
            status_code=403,
            detail="Public registration is disabled. Users can be created only by manager or admin",
        )

    existing = db.query(User).filter(User.login == payload.login).first()
    if existing:
        raise HTTPException(status_code=400, detail="A user with this login already exists")

    if payload.role is not None:
        role = payload.role
    else:
        role = UserRole.manager if user_count == 0 else UserRole.developer

    return create_user_record(
        db,
        name=payload.name,
        login=payload.login,
        role=role,
        password_hash=hash_password(payload.password),
    )


def _extract_login_credentials(payload: object) -> tuple[str, str]:
    if not isinstance(payload, dict):
        return "", ""

    raw_login = payload.get("login") or payload.get("username") or ""
    raw_password = payload.get("password") or ""
    return str(raw_login).strip(), str(raw_password)


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    content_type = request.headers.get("content-type", "").lower()

    if "application/x-www-form-urlencoded" in content_type:
        raw_body = (await request.body()).decode("utf-8", errors="ignore")
        form_payload = parse_qs(raw_body, keep_blank_values=True)
        login = str((form_payload.get("username") or form_payload.get("login") or [""])[0]).strip()
        password = str((form_payload.get("password") or [""])[0])
    else:
        try:
            payload = await request.json()
        except ValueError:
            payload = {}
        login, password = _extract_login_credentials(payload)

    if len(login) < 3 or len(password) < 8:
        raise HTTPException(status_code=422, detail="Invalid login payload")

    user = db.query(User).filter(User.login == login).first()
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid login or password")

    token = create_access_token(user)
    return TokenResponse(access_token=token, token_type="bearer", user=user)


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
