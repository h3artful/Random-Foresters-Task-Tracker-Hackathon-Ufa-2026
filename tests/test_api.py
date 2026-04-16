import os
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

TEST_DB_PATH = ROOT / "tests" / "test_task_tracker.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-with-safe-length-123456"

from app.database import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
def setup_test_db() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_db_file() -> None:
    yield
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def register_user(client: TestClient, name: str, email: str, password: str = "pass-12345") -> dict:
    response = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    assert response.status_code == 201
    return response.json()


def login_headers(client: TestClient, email: str, password: str = "pass-12345") -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_auth_and_roles(client: TestClient) -> None:
    suffix = uuid4().hex[:8]

    manager = register_user(client, "Manager", f"manager-{suffix}@example.com")
    developer = register_user(client, "Developer", f"developer-{suffix}@example.com")

    assert manager["role"] == "manager"
    assert developer["role"] == "developer"

    explicit_role_payload = client.post(
        "/api/auth/register",
        json={
            "name": "Role Selected Manager",
            "email": f"selected-manager-{suffix}@example.com",
            "password": "pass-12345",
            "role": "manager",
        },
    )
    assert explicit_role_payload.status_code == 201
    assert explicit_role_payload.json()["role"] == "manager"

    # Swagger OAuth2 password flow sends form fields: username/password.
    oauth_form_login = client.post(
        "/api/auth/login",
        data={"username": manager["email"], "password": "pass-12345"},
    )
    assert oauth_form_login.status_code == 200


def test_project_sprint_task_flow(client: TestClient) -> None:
    suffix = uuid4().hex[:8]

    manager_email = f"mgr-{suffix}@example.com"
    dev_email = f"dev-{suffix}@example.com"

    manager = register_user(client, "Alice Manager", manager_email)
    developer = register_user(client, "Bob Dev", dev_email)

    manager_headers = login_headers(client, manager_email)
    dev_headers = login_headers(client, dev_email)

    create_project = client.post(
        "/api/projects",
        json={"name": "Core Platform", "description": "Hackathon project"},
        headers=manager_headers,
    )
    assert create_project.status_code == 201
    project_id = create_project.json()["id"]

    add_member = client.post(
        f"/api/projects/{project_id}/members",
        json={"user_id": developer["id"]},
        headers=manager_headers,
    )
    assert add_member.status_code == 201

    create_sprint = client.post(
        f"/api/projects/{project_id}/sprints",
        json={
            "name": "Sprint 1",
            "goal": "MVP delivery",
            "start_date": "2026-04-16",
            "end_date": "2026-04-20",
            "status": "active",
        },
        headers=manager_headers,
    )
    assert create_sprint.status_code == 201
    sprint_id = create_sprint.json()["id"]

    create_task = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Implement auth",
            "description": "JWT auth for MVP",
            "type": "feature",
            "priority": "high",
            "assignee_id": developer["id"],
            "sprint_id": sprint_id,
        },
        headers=manager_headers,
    )
    assert create_task.status_code == 201
    task_id = create_task.json()["id"]
    assert create_task.json()["status"] == "open"

    wrong_jump = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "in_progress"},
        headers=dev_headers,
    )
    assert wrong_jump.status_code == 400

    selected = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "selected"},
        headers=dev_headers,
    )
    assert selected.status_code == 200

    in_progress = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "in_progress"},
        headers=dev_headers,
    )
    assert in_progress.status_code == 200

    ready = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "ready_for_acceptance"},
        headers=dev_headers,
    )
    assert ready.status_code == 200

    dev_close = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "closed"},
        headers=dev_headers,
    )
    assert dev_close.status_code == 403

    manager_close = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "closed"},
        headers=manager_headers,
    )
    assert manager_close.status_code == 200

    history = client.get(f"/api/tasks/{task_id}/history", headers=manager_headers)
    assert history.status_code == 200
    assert len(history.json()) >= 4


def test_access_and_filters(client: TestClient) -> None:
    suffix = uuid4().hex[:8]

    manager_email = f"lead-{suffix}@example.com"
    dev_a_email = f"dev-a-{suffix}@example.com"
    dev_b_email = f"dev-b-{suffix}@example.com"

    manager = register_user(client, "Lead", manager_email)
    dev_a = register_user(client, "Dev A", dev_a_email)
    dev_b = register_user(client, "Dev B", dev_b_email)

    manager_headers = login_headers(client, manager_email)
    dev_a_headers = login_headers(client, dev_a_email)

    project = client.post(
        "/api/projects",
        json={"name": "Analytics", "description": "tracking"},
        headers=manager_headers,
    )
    assert project.status_code == 201
    project_id = project.json()["id"]

    add_member = client.post(
        f"/api/projects/{project_id}/members",
        json={"user_id": dev_a["id"]},
        headers=manager_headers,
    )
    assert add_member.status_code == 201

    # Only developers can be assigned to projects.
    manager_to_project = client.post(
        f"/api/projects/{project_id}/members",
        json={"user_id": manager["id"]},
        headers=manager_headers,
    )
    assert manager_to_project.status_code == 400

    create_bug = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Fix metric bug",
            "description": "counter mismatch",
            "type": "bug",
            "priority": "medium",
            "assignee_id": dev_a["id"],
        },
        headers=manager_headers,
    )
    assert create_bug.status_code == 201

    # Task assignee must be a member of the same project.
    create_for_outsider = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Outsider assignment",
            "description": "should fail",
            "type": "feature",
            "priority": "low",
            "assignee_id": dev_b["id"],
        },
        headers=manager_headers,
    )
    assert create_for_outsider.status_code == 400

    list_filtered = client.get(
        f"/api/tasks?project_id={project_id}&type=bug&priority=medium",
        headers=manager_headers,
    )
    assert list_filtered.status_code == 200
    assert len(list_filtered.json()) == 1

    dashboard = client.get(f"/api/dashboard/summary?project_id={project_id}", headers=dev_a_headers)
    assert dashboard.status_code == 200
    assert dashboard.json()["total_tasks"] == 1

    # Manager can create task in this project, but unrelated developer cannot access it.
    outsider_headers = login_headers(client, dev_b_email)
    outsider_tasks = client.get(f"/api/tasks?project_id={project_id}", headers=outsider_headers)
    assert outsider_tasks.status_code == 200
    assert outsider_tasks.json() == []

    members = client.get(f"/api/projects/{project_id}/members", headers=dev_a_headers)
    assert members.status_code == 200

    # Non-manager cannot create project.
    forbidden_project = client.post(
        "/api/projects",
        json={"name": "Forbidden", "description": "nope"},
        headers=dev_a_headers,
    )
    assert forbidden_project.status_code == 403


def test_task_duplicate_detection_blocks_confident_duplicate(client: TestClient) -> None:
    suffix = uuid4().hex[:8]
    manager_email = f"dup-mgr-{suffix}@example.com"
    developer_email = f"dup-dev-{suffix}@example.com"

    manager = register_user(client, "Dup Manager", manager_email)
    developer = register_user(client, "Dup Dev", developer_email)

    manager_headers = login_headers(client, manager_email)

    project = client.post(
        "/api/projects",
        json={"name": "Duplicate Guard", "description": "project for duplicate checks"},
        headers=manager_headers,
    )
    assert project.status_code == 201
    project_id = project.json()["id"]

    add_member = client.post(
        f"/api/projects/{project_id}/members",
        json={"user_id": developer["id"]},
        headers=manager_headers,
    )
    assert add_member.status_code == 201

    original = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Implement JWT login endpoint",
            "description": "Create access token endpoint and validate credentials",
            "type": "feature",
            "priority": "high",
            "assignee_id": developer["id"],
        },
        headers=manager_headers,
    )
    assert original.status_code == 201

    duplicate = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Implement JWT endpoint for login",
            "description": "Create token endpoint and validate user credentials",
            "type": "feature",
            "priority": "high",
            "assignee_id": developer["id"],
        },
        headers=manager_headers,
    )
    assert duplicate.status_code == 409
    assert "Possible duplicate task found" in duplicate.json()["detail"]


def test_task_duplicate_detection_blocks_duplicate_of_closed_task(client: TestClient) -> None:
    suffix = uuid4().hex[:8]
    manager_email = f"dup-closed-mgr-{suffix}@example.com"
    developer_email = f"dup-closed-dev-{suffix}@example.com"

    manager = register_user(client, "Dup Closed Manager", manager_email)
    developer = register_user(client, "Dup Closed Dev", developer_email)

    manager_headers = login_headers(client, manager_email)
    dev_headers = login_headers(client, developer_email)

    project = client.post(
        "/api/projects",
        json={"name": "Duplicate Closed Guard", "description": "project for closed duplicate checks"},
        headers=manager_headers,
    )
    assert project.status_code == 201
    project_id = project.json()["id"]

    add_member = client.post(
        f"/api/projects/{project_id}/members",
        json={"user_id": developer["id"]},
        headers=manager_headers,
    )
    assert add_member.status_code == 201

    original = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Write API usage guide",
            "description": "Prepare docs for manager and developer workflows",
            "type": "documentation",
            "priority": "medium",
            "assignee_id": developer["id"],
        },
        headers=manager_headers,
    )
    assert original.status_code == 201
    task_id = original.json()["id"]

    selected = client.patch(f"/api/tasks/{task_id}/status", json={"status": "selected"}, headers=dev_headers)
    in_progress = client.patch(f"/api/tasks/{task_id}/status", json={"status": "in_progress"}, headers=dev_headers)
    ready = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "ready_for_acceptance"},
        headers=dev_headers,
    )
    closed = client.patch(f"/api/tasks/{task_id}/status", json={"status": "closed"}, headers=manager_headers)
    assert selected.status_code == 200
    assert in_progress.status_code == 200
    assert ready.status_code == 200
    assert closed.status_code == 200

    duplicate_after_close = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Write API usage guide",
            "description": "Prepare docs for manager and developer workflows",
            "type": "documentation",
            "priority": "medium",
            "assignee_id": developer["id"],
        },
        headers=manager_headers,
    )
    assert duplicate_after_close.status_code == 409


def test_task_duplicate_detection_requires_review_before_suspicious_creation(client: TestClient) -> None:
    suffix = uuid4().hex[:8]
    manager_email = f"dup-warning-mgr-{suffix}@example.com"
    developer_email = f"dup-warning-dev-{suffix}@example.com"

    manager = register_user(client, "Dup Warning Manager", manager_email)
    developer = register_user(client, "Dup Warning Dev", developer_email)

    manager_headers = login_headers(client, manager_email)

    project = client.post(
        "/api/projects",
        json={"name": "Duplicate Warning Guard", "description": "project for warning checks"},
        headers=manager_headers,
    )
    assert project.status_code == 201
    project_id = project.json()["id"]

    add_member = client.post(
        f"/api/projects/{project_id}/members",
        json={"user_id": developer["id"]},
        headers=manager_headers,
    )
    assert add_member.status_code == 201

    original = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Write API usage guide",
            "description": "Document endpoints and auth flow for developers",
            "type": "documentation",
            "priority": "medium",
            "assignee_id": developer["id"],
        },
        headers=manager_headers,
    )
    assert original.status_code == 201

    suspicious = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Write API integration guide",
            "description": "Document endpoint examples for onboarding",
            "type": "documentation",
            "priority": "medium",
            "assignee_id": developer["id"],
        },
        headers=manager_headers,
    )
    assert suspicious.status_code == 409
    review_payload = suspicious.json()["detail"]
    assert review_payload["code"] == "duplicate_review_required"
    assert review_payload["task_id"] == original.json()["id"]
    assert review_payload["similarity_percent"] >= 55

    approved = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Write API integration guide",
            "description": "Document endpoint examples for onboarding",
            "type": "documentation",
            "priority": "medium",
            "assignee_id": developer["id"],
            "duplicate_review_confirmed": True,
            "duplicate_review_task_id": original.json()["id"],
        },
        headers=manager_headers,
    )
    assert approved.status_code == 201
