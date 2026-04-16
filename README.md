# Task Tracker (Hackathon MVP)

Task management service aligned with hackathon requirements.

## Implemented MVP
- Registration/login with JWT
- Roles: `manager`, `developer`
- Projects and participants
- Sprints inside projects
- Tasks with attributes:
  - title
  - description
  - type (`feature`, `bug`, `tech_debt`, `documentation`)
  - priority (`low`, `medium`, `high`)
  - assignee
  - sprint binding
- Strict status flow:
  - `open -> selected -> in_progress -> ready_for_acceptance -> closed`
- Role-based workflow:
  - Manager: creates/assigns tasks, closes accepted tasks
  - Developer: takes task into work and moves it to acceptance
- REST API + Swagger/OpenAPI

## Run
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
make seed
uvicorn app.main:app --reload
```

Open:
- Web UI: <http://127.0.0.1:8000/>
- API docs: <http://127.0.0.1:8000/docs>
- OpenAPI: <http://127.0.0.1:8000/openapi.json>

Demo users after `make seed`:
- Manager: `manager@demo.local` / `demo12345`
- Developer: `developer@demo.local` / `demo12345`

## Quick Manual Walkthrough
1. Open Swagger: <http://127.0.0.1:8000/docs>
2. Call `POST /api/auth/login` with manager credentials and copy `access_token`.
3. Click `Authorize` in Swagger and paste `Bearer <access_token>`.
4. Open:
   - `GET /api/projects`
   - `GET /api/projects/{project_id}/sprints`
   - `GET /api/tasks`
   - `GET /api/dashboard/summary`
5. Repeat login with developer credentials and test `PATCH /api/tasks/{task_id}/status` with strict transitions.

## Test
```bash
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```
