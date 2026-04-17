from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from ..models import User, UserRole, utcnow_naive


def users_table_has_email_column(db: Session) -> bool:
    bind = db.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("users")}
    return "email" in columns


def create_user_record(
    db: Session,
    *,
    name: str,
    login: str,
    role: UserRole,
    password_hash: str,
) -> User:
    if users_table_has_email_column(db):
        db.execute(
            text(
                """
                INSERT INTO users (name, login, email, password_hash, role, created_at)
                VALUES (:name, :login, :email, :password_hash, :role, :created_at)
                """
            ),
            {
                "name": name,
                "login": login,
                "email": login,
                "password_hash": password_hash,
                "role": role.value,
                "created_at": utcnow_naive(),
            },
        )
        db.commit()
        created = db.query(User).filter(User.login == login).first()
        if created is None:
            raise RuntimeError("User creation failed")
        return created

    user = User(
        name=name,
        login=login,
        role=role,
        password_hash=password_hash,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
