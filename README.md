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
uvicorn app.main:app --reload
```

Open:
- API docs: <http://127.0.0.1:8000/docs>
- OpenAPI: <http://127.0.0.1:8000/openapi.json>

## Test
```bash
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```
