import os
import sys
from datetime import timedelta
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

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Task, utcnow_naive


@pytest.fixture(autouse=True)
def setup_test_db() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    register_user._creator = None
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


def register_user(
    client: TestClient,
    name: str,
    login: str,
    password: str = "pass-12345",
    role: str | None = None,
) -> dict:
    payload = {"name": name, "login": login, "password": password}
    if role is not None:
        payload["role"] = role

    response = client.post("/api/auth/register", json=payload)
    if response.status_code == 201:
        user_payload = response.json()
        if user_payload["role"] in {"manager", "admin"}:
            register_user._creator = {"login": login, "password": password}
        return user_payload

    if response.status_code == 403:
        creator = getattr(register_user, "_creator", None)
        assert creator is not None
        creator_headers = login_headers(client, creator["login"], creator["password"])
        create_response = client.post("/api/users", json=payload, headers=creator_headers)
        assert create_response.status_code == 201
        return create_response.json()

    assert response.status_code == 201
    return response.json()


def login_headers(client: TestClient, login: str, password: str = "pass-12345") -> dict[str, str]:
    response = client.post("/api/auth/login", json={"login": login, "password": password})
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_auth_and_roles(client: TestClient) -> None:
    suffix = uuid4().hex[:8]

    manager = register_user(client, "Manager", f"manager-{suffix}")
    developer = register_user(client, "Developer", f"developer-{suffix}")

    assert manager["role"] == "manager"
    assert developer["role"] == "developer"

    manager_headers = login_headers(client, manager["login"])
    explicit_role_payload = client.post(
        "/api/users",
        json={
            "name": "Role Selected Manager",
            "login": f"selected-manager-{suffix}",
            "password": "pass-12345",
            "role": "manager",
        },
        headers=manager_headers,
    )
    assert explicit_role_payload.status_code == 201
    assert explicit_role_payload.json()["role"] == "manager"

    # Swagger OAuth2 password flow sends form fields: username/password.
    oauth_form_login = client.post(
        "/api/auth/login",
        data={"username": manager["login"], "password": "pass-12345"},
    )
    assert oauth_form_login.status_code == 200


def test_user_creation_is_restricted_to_manager_or_admin(client: TestClient) -> None:
    suffix = uuid4().hex[:8]

    manager = register_user(client, "Manager Restrict", f"manager-restrict-{suffix}")
    developer = register_user(client, "Developer Restrict", f"developer-restrict-{suffix}")

    manager_headers = login_headers(client, manager["login"])
    developer_headers = login_headers(client, developer["login"])

    manager_can_create = client.post(
        "/api/users",
        json={
            "name": "Created By Manager",
            "login": f"created-by-manager-{suffix}",
            "password": "pass-12345",
            "role": "developer",
        },
        headers=manager_headers,
    )
    assert manager_can_create.status_code == 201

    developer_cannot_create = client.post(
        "/api/users",
        json={
            "name": "Created By Developer",
            "login": f"created-by-developer-{suffix}",
            "password": "pass-12345",
            "role": "developer",
        },
        headers=developer_headers,
    )
    assert developer_cannot_create.status_code == 403

    public_register_disabled = client.post(
        "/api/auth/register",
        json={
            "name": "Public Register User",
            "login": f"public-register-{suffix}",
            "password": "pass-12345",
        },
    )
    assert public_register_disabled.status_code == 403


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
            "priority": "High",
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


def test_task_comments_flow(client: TestClient) -> None:
    suffix = uuid4().hex[:8]

    manager_email = f"comments-mgr-{suffix}@example.com"
    developer_email = f"comments-dev-{suffix}@example.com"
    outsider_email = f"comments-outsider-{suffix}@example.com"

    manager = register_user(client, "Comments Manager", manager_email)
    developer = register_user(client, "Comments Developer", developer_email)
    _ = register_user(client, "Comments Outsider", outsider_email)

    manager_headers = login_headers(client, manager_email)
    developer_headers = login_headers(client, developer_email)
    outsider_headers = login_headers(client, outsider_email)

    project = client.post(
        "/api/projects",
        json={"name": "Comments Project", "description": "comments checks"},
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

    create_task = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Comments task",
            "description": "Task for comment checks",
            "type": "feature",
            "priority": "Medium",
            "assignee_id": developer["id"],
        },
        headers=manager_headers,
    )
    assert create_task.status_code == 201
    task_id = create_task.json()["id"]

    first_comment = client.post(
        f"/api/tasks/{task_id}/comments",
        json={"content": "Manager comment"},
        headers=manager_headers,
    )
    assert first_comment.status_code == 201
    assert first_comment.json()["content"] == "Manager comment"
    assert first_comment.json()["author_id"] == manager["id"]

    second_comment = client.post(
        f"/api/tasks/{task_id}/comments",
        json={"content": "Developer update on this task"},
        headers=developer_headers,
    )
    assert second_comment.status_code == 201
    assert second_comment.json()["author_id"] == developer["id"]

    empty_comment = client.post(
        f"/api/tasks/{task_id}/comments",
        json={"content": "   "},
        headers=manager_headers,
    )
    assert empty_comment.status_code == 400

    comments = client.get(f"/api/tasks/{task_id}/comments", headers=manager_headers)
    assert comments.status_code == 200
    payload = comments.json()
    assert len(payload) == 2
    assert payload[0]["content"] == "Manager comment"
    assert payload[0]["author"]["id"] == manager["id"]
    assert payload[1]["author"]["id"] == developer["id"]

    outsider_read = client.get(f"/api/tasks/{task_id}/comments", headers=outsider_headers)
    assert outsider_read.status_code == 403

    outsider_write = client.post(
        f"/api/tasks/{task_id}/comments",
        json={"content": "Outsider should not comment"},
        headers=outsider_headers,
    )
    assert outsider_write.status_code == 403


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
            "priority": "Medium",
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
            "priority": "Low",
            "assignee_id": dev_b["id"],
        },
        headers=manager_headers,
    )
    assert create_for_outsider.status_code == 400

    list_filtered = client.get(
        f"/api/tasks?project_id={project_id}&type=bug&priority=Medium",
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


def test_developer_dashboard_returns_personal_cross_project_view(client: TestClient) -> None:
    suffix = uuid4().hex[:8]

    manager_email = f"devdash-mgr-{suffix}@example.com"
    developer_email = f"devdash-dev-{suffix}@example.com"
    other_dev_email = f"devdash-other-{suffix}@example.com"

    manager = register_user(client, "Dashboard Manager", manager_email)
    developer = register_user(client, "Dashboard Developer", developer_email)
    other_developer = register_user(client, "Dashboard Other", other_dev_email)

    manager_headers = login_headers(client, manager_email)
    developer_headers = login_headers(client, developer_email)

    alpha_project = client.post(
        "/api/projects",
        json={"name": "Alpha Project", "description": "alpha"},
        headers=manager_headers,
    )
    assert alpha_project.status_code == 201
    alpha_project_id = alpha_project.json()["id"]

    beta_project = client.post(
        "/api/projects",
        json={"name": "Beta Project", "description": "beta"},
        headers=manager_headers,
    )
    assert beta_project.status_code == 201
    beta_project_id = beta_project.json()["id"]

    add_member_alpha = client.post(
        f"/api/projects/{alpha_project_id}/members",
        json={"user_id": developer["id"]},
        headers=manager_headers,
    )
    assert add_member_alpha.status_code == 201

    add_member_beta = client.post(
        f"/api/projects/{beta_project_id}/members",
        json={"user_id": developer["id"]},
        headers=manager_headers,
    )
    assert add_member_beta.status_code == 201

    task_open = client.post(
        f"/api/projects/{alpha_project_id}/tasks",
        json={
            "title": "Alpha open task",
            "description": "open",
            "type": "feature",
            "priority": "Medium",
            "assignee_id": developer["id"],
        },
        headers=manager_headers,
    )
    assert task_open.status_code == 201
    task_open_id = task_open.json()["id"]

    task_selected = client.post(
        f"/api/projects/{beta_project_id}/tasks",
        json={
            "title": "Beta selected task",
            "description": "selected",
            "type": "bug",
            "priority": "High",
            "assignee_id": developer["id"],
        },
        headers=manager_headers,
    )
    assert task_selected.status_code == 201
    task_selected_id = task_selected.json()["id"]

    move_selected = client.patch(
        f"/api/tasks/{task_selected_id}/status",
        json={"status": "selected"},
        headers=developer_headers,
    )
    assert move_selected.status_code == 200

    task_closed = client.post(
        f"/api/projects/{beta_project_id}/tasks",
        json={
            "title": "Beta closed task",
            "description": "closed",
            "type": "documentation",
            "priority": "Low",
            "assignee_id": developer["id"],
        },
        headers=manager_headers,
    )
    assert task_closed.status_code == 201
    task_closed_id = task_closed.json()["id"]

    for next_status in ["selected", "in_progress", "ready_for_acceptance"]:
        progress_response = client.patch(
            f"/api/tasks/{task_closed_id}/status",
            json={"status": next_status},
            headers=developer_headers,
        )
        assert progress_response.status_code == 200

    close_response = client.patch(
        f"/api/tasks/{task_closed_id}/status",
        json={"status": "closed"},
        headers=manager_headers,
    )
    assert close_response.status_code == 200

    own_dashboard = client.get("/api/dashboard/developer", headers=developer_headers)
    assert own_dashboard.status_code == 200
    payload = own_dashboard.json()
    assert payload["assignee_id"] == developer["id"]
    assert payload["total_tasks"] == 3
    assert payload["active_tasks"] == 2
    assert payload["by_status"]["open"] == 1
    assert payload["by_status"]["selected"] == 1
    assert payload["by_status"]["closed"] == 1
    assert {task["id"] for task in payload["tasks"]} == {task_open_id, task_selected_id, task_closed_id}
    assert {item["project_id"] for item in payload["by_project"]} == {alpha_project_id, beta_project_id}

    forbidden_dashboard = client.get(
        f"/api/dashboard/developer?assignee_id={other_developer['id']}",
        headers=developer_headers,
    )
    assert forbidden_dashboard.status_code == 403

    manager_view = client.get(
        f"/api/dashboard/developer?assignee_id={developer['id']}",
        headers=manager_headers,
    )
    assert manager_view.status_code == 200
    assert manager_view.json()["total_tasks"] == 3


def test_task_duration_estimate_endpoints_are_manager_only(client: TestClient) -> None:
    suffix = uuid4().hex[:8]

    manager_email = f"ml-mgr-{suffix}@example.com"
    developer_email = f"ml-dev-{suffix}@example.com"

    manager = register_user(client, "ML Manager", manager_email)
    developer = register_user(client, "ML Developer", developer_email)

    manager_headers = login_headers(client, manager_email)
    developer_headers = login_headers(client, developer_email)

    project = client.post(
        "/api/projects",
        json={"name": "ML ETA Project", "description": "prediction visibility checks"},
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

    create_task = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Fix login timeout in auth flow",
            "description": "Users receive timeout on slow network",
            "type": "bug",
            "priority": "High",
            "assignee_id": developer["id"],
        },
        headers=manager_headers,
    )
    assert create_task.status_code == 201
    task_id = create_task.json()["id"]

    manager_estimates = client.get(
        f"/api/tasks/estimates?project_id={project_id}",
        headers=manager_headers,
    )
    assert manager_estimates.status_code == 200
    estimates_payload = manager_estimates.json()
    if estimates_payload:
        assert all("task_id" in item and "label" in item for item in estimates_payload)
        assert any(item["task_id"] == task_id for item in estimates_payload)

    manager_single_estimate = client.get(f"/api/tasks/{task_id}/estimate", headers=manager_headers)
    assert manager_single_estimate.status_code == 200
    single_payload = manager_single_estimate.json()
    if single_payload is not None:
        assert single_payload["task_id"] == task_id
        assert "label" in single_payload

    developer_estimates = client.get(
        f"/api/tasks/estimates?project_id={project_id}",
        headers=developer_headers,
    )
    assert developer_estimates.status_code == 403

    developer_single_estimate = client.get(
        f"/api/tasks/{task_id}/estimate",
        headers=developer_headers,
    )
    assert developer_single_estimate.status_code == 403


def test_task_duration_estimate_handles_cyrillic_text_without_api_failure(client: TestClient) -> None:
    suffix = uuid4().hex[:8]

    manager_email = f"ml-cyr-mgr-{suffix}@example.com"
    developer_email = f"ml-cyr-dev-{suffix}@example.com"

    manager = register_user(client, "ML Cyr Manager", manager_email)
    developer = register_user(client, "ML Cyr Developer", developer_email)

    manager_headers = login_headers(client, manager_email)

    project = client.post(
        "/api/projects",
        json={"name": "ML Cyrillic Project", "description": "cyrillic prediction checks"},
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

    create_task = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Починить цвет кнопки в профиле",
            "description": "После обновления кнопка стала серой вместо зелёной",
            "type": "feature",
            "priority": "Low",
            "assignee_id": developer["id"],
        },
        headers=manager_headers,
    )
    assert create_task.status_code == 201
    task_id = create_task.json()["id"]

    estimate_response = client.get(f"/api/tasks/{task_id}/estimate", headers=manager_headers)
    assert estimate_response.status_code == 200
    payload = estimate_response.json()
    if payload is not None:
        assert payload["task_id"] == task_id
        assert "label" in payload


def test_task_archive_flow_and_visibility(client: TestClient) -> None:
    suffix = uuid4().hex[:8]

    manager_email = f"archive-mgr-{suffix}@example.com"
    developer_email = f"archive-dev-{suffix}@example.com"

    manager = register_user(client, "Archive Manager", manager_email)
    developer = register_user(client, "Archive Developer", developer_email)

    manager_headers = login_headers(client, manager_email)
    developer_headers = login_headers(client, developer_email)

    project = client.post(
        "/api/projects",
        json={"name": "Archive Project", "description": "archive checks"},
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

    create_task = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Archive candidate",
            "description": "Task to check archive behavior",
            "type": "feature",
            "priority": "Medium",
            "assignee_id": developer["id"],
        },
        headers=manager_headers,
    )
    assert create_task.status_code == 201
    task_id = create_task.json()["id"]

    archive_not_closed = client.post(f"/api/tasks/{task_id}/archive", headers=manager_headers)
    assert archive_not_closed.status_code == 400

    selected = client.patch(f"/api/tasks/{task_id}/status", json={"status": "selected"}, headers=developer_headers)
    in_progress = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "in_progress"},
        headers=developer_headers,
    )
    ready = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "ready_for_acceptance"},
        headers=developer_headers,
    )
    closed = client.patch(f"/api/tasks/{task_id}/status", json={"status": "closed"}, headers=manager_headers)
    assert selected.status_code == 200
    assert in_progress.status_code == 200
    assert ready.status_code == 200
    assert closed.status_code == 200

    developer_archive = client.post(f"/api/tasks/{task_id}/archive", headers=developer_headers)
    assert developer_archive.status_code == 403

    manager_archive = client.post(f"/api/tasks/{task_id}/archive", headers=manager_headers)
    assert manager_archive.status_code == 200
    archive_payload = manager_archive.json()
    assert archive_payload["archived_at"] is not None
    assert archive_payload["archived_by_id"] == manager["id"]

    default_list = client.get(f"/api/tasks?project_id={project_id}", headers=manager_headers)
    assert default_list.status_code == 200
    assert default_list.json() == []

    archived_list = client.get(f"/api/tasks?project_id={project_id}&archived=true", headers=manager_headers)
    assert archived_list.status_code == 200
    assert len(archived_list.json()) == 1
    assert archived_list.json()[0]["id"] == task_id


def test_admin_can_override_statuses_and_restore_from_archive(client: TestClient) -> None:
    suffix = uuid4().hex[:8]
    admin_email = f"admin-{suffix}@example.com"
    developer_email = f"admin-dev-{suffix}@example.com"

    admin_register = register_user(
        client,
        name="Super Admin",
        login=admin_email,
        role="admin",
    )
    assert admin_register["role"] == "admin"

    developer = register_user(client, "Admin Project Dev", developer_email)
    admin_headers = login_headers(client, admin_email)

    project = client.post(
        "/api/projects",
        json={"name": "Admin Control Project", "description": "admin flow checks"},
        headers=admin_headers,
    )
    assert project.status_code == 201
    project_id = project.json()["id"]

    add_member = client.post(
        f"/api/projects/{project_id}/members",
        json={"user_id": developer["id"]},
        headers=admin_headers,
    )
    assert add_member.status_code == 201

    create_task = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Admin status override task",
            "description": "Task for checking unrestricted admin status changes",
            "type": "feature",
            "priority": "High",
            "assignee_id": developer["id"],
        },
        headers=admin_headers,
    )
    assert create_task.status_code == 201
    task_id = create_task.json()["id"]

    direct_close = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "closed"},
        headers=admin_headers,
    )
    assert direct_close.status_code == 200
    assert direct_close.json()["status"] == "closed"

    archived = client.post(f"/api/tasks/{task_id}/archive", headers=admin_headers)
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None

    restored = client.post(f"/api/tasks/{task_id}/restore", headers=admin_headers)
    assert restored.status_code == 200
    assert restored.json()["archived_at"] is None
    assert restored.json()["archived_by_id"] is None

    reopen_to_in_progress = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "in_progress"},
        headers=admin_headers,
    )
    assert reopen_to_in_progress.status_code == 200
    assert reopen_to_in_progress.json()["status"] == "in_progress"


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
            "priority": "High",
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
            "priority": "High",
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
            "priority": "Medium",
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
            "priority": "Medium",
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
            "priority": "Medium",
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
            "priority": "Medium",
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
            "priority": "Medium",
            "assignee_id": developer["id"],
            "duplicate_review_confirmed": True,
            "duplicate_review_task_id": original.json()["id"],
        },
        headers=manager_headers,
    )
    assert approved.status_code == 201


def test_hybrid_time_tracking_auto_accumulates_and_accepts_manual_correction(client: TestClient) -> None:
    suffix = uuid4().hex[:8]
    manager_email = f"time-mgr-{suffix}@example.com"
    developer_email = f"time-dev-{suffix}@example.com"

    manager = register_user(client, "Time Manager", manager_email)
    developer = register_user(client, "Time Dev", developer_email)

    manager_headers = login_headers(client, manager_email)
    developer_headers = login_headers(client, developer_email)

    project = client.post(
        "/api/projects",
        json={"name": "Time Hybrid Project", "description": "time checks"},
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

    create_task = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Track spent time",
            "description": "Hybrid time tracking",
            "type": "feature",
            "priority": "Medium",
            "assignee_id": developer["id"],
        },
        headers=manager_headers,
    )
    assert create_task.status_code == 201
    task_id = create_task.json()["id"]

    selected = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "selected"},
        headers=developer_headers,
    )
    assert selected.status_code == 200

    in_progress = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "in_progress"},
        headers=developer_headers,
    )
    assert in_progress.status_code == 200
    assert in_progress.json()["in_progress_started_at"] is not None

    with SessionLocal() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        task.in_progress_started_at = utcnow_naive() - timedelta(minutes=10)
        db.commit()

    ready = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "ready_for_acceptance"},
        headers=developer_headers,
    )
    assert ready.status_code == 200
    ready_payload = ready.json()
    assert ready_payload["tracked_seconds"] >= 600
    assert ready_payload["reported_seconds"] is None
    assert ready_payload["in_progress_started_at"] is None

def test_time_tracking_validates_manual_payload_and_stores_reported_time(client: TestClient) -> None:
    suffix = uuid4().hex[:8]
    admin_email = f"time-admin-{suffix}@example.com"
    developer_email = f"time2-dev-{suffix}@example.com"

    admin_register = register_user(
        client,
        name="Time Admin",
        login=admin_email,
        role="admin",
    )
    assert admin_register["role"] == "admin"

    developer = register_user(client, "Time Dev Two", developer_email)
    admin_headers = login_headers(client, admin_email)
    developer_headers = login_headers(client, developer_email)

    project = client.post(
        "/api/projects",
        json={"name": "Manual Time Project", "description": "manual time checks"},
        headers=admin_headers,
    )
    assert project.status_code == 201
    project_id = project.json()["id"]

    add_member = client.post(
        f"/api/projects/{project_id}/members",
        json={"user_id": developer["id"]},
        headers=admin_headers,
    )
    assert add_member.status_code == 201

    create_task = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Manual time report",
            "description": "Manual correction flow",
            "type": "documentation",
            "priority": "Low",
            "assignee_id": developer["id"],
        },
        headers=admin_headers,
    )
    assert create_task.status_code == 201
    task_id = create_task.json()["id"]

    selected = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "selected"},
        headers=developer_headers,
    )
    assert selected.status_code == 200

    invalid_manual_payload = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "in_progress", "reported_spent_minutes": 12},
        headers=developer_headers,
    )
    assert invalid_manual_payload.status_code == 400

    in_progress = client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "in_progress"},
        headers=developer_headers,
    )
    assert in_progress.status_code == 200

    ready_with_manual = client.patch(
        f"/api/tasks/{task_id}/status",
        json={
            "status": "ready_for_acceptance",
            "reported_spent_minutes": 135,
            "reported_spent_comment": "Includes pair-programming session",
        },
        headers=developer_headers,
    )
    assert ready_with_manual.status_code == 200
    ready_payload = ready_with_manual.json()
    assert ready_payload["reported_seconds"] == 8100
    assert ready_payload["reported_comment"] == "Includes pair-programming session"
