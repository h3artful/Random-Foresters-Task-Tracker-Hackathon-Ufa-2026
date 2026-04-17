# Task Tracker (Hackathon MVP)

Task management service aligned with hackathon requirements.

## Quick Start (Docker, recommended for team/jury)
1. Make sure Docker Desktop is running.
2. Create env file:
   - `cp .env.example .env`
3. Build and start:
   - `docker compose up --build -d`
4. (Optional) seed demo data:
   - `docker compose exec api python -m app.seed`
5. Open:
   - `http://127.0.0.1:8000`

Useful Docker commands:
- `make docker-up` - build + start in background
- `make docker-logs` - follow API logs
- `make docker-seed` - seed demo users/projects/tasks
- `make docker-down` - stop containers

Translation model bootstrap in container:
- By default, translation bootstrap is disabled (`BOOTSTRAP_TRANSLATION=0`).
- Set `BOOTSTRAP_TRANSLATION=1` in `.env` to download/install local ru->en model on first container start.
- This requires internet once and may take a few minutes.

## Quick Start
1. Clone the repository.
2. Make sure `python3` is available (tested on Python `3.14.x`).
3. Run one command for full setup (including local RU->EN translation resources):
   - `make setup-all`
4. Start the app:
   - `make dev-reload`
5. Open:
   - `http://127.0.0.1:8000`

If you only need core app setup without translation bootstrap:
- `make setup`

Useful commands:
- `make test` - run tests
- `make seed` - seed demo data
- `make bootstrap-translation` - install/update local translation models
- `make clean-venv` - remove virtualenv

## Implemented MVP
- Login with JWT
- User creation is restricted to `manager`/`admin`
- Roles: `manager`, `developer`
- Projects and participants
- Sprints inside projects
- Tasks with attributes:
  - title
  - description
  - type (`feature`, `bug`, `tech_debt`, `documentation`)
  - priority (`Trivial`, `Minor`, `Low`, `Medium`, `Major`, `High`, `Critical`, `Blocker`)
  - assignee
  - sprint binding
- Strict status flow:
  - `open -> selected -> in_progress -> ready_for_acceptance -> closed`
- Role-based workflow:
  - Manager: creates/assigns tasks, closes accepted tasks
  - Developer: takes task into work and moves it to acceptance
- REST API + Swagger/OpenAPI

## Local RU->EN Translation for ML ETA
- ETA model expects English task text.
- If task title/description contains Cyrillic, backend translates it locally (`ru -> en`) before prediction.
- No external translation APIs are used in runtime.
- Translation data is stored locally in project directory `.argos/`.
- Optional env var: `ARGOS_RU_EN_PACKAGE_PATH=/absolute/path/to/ru_en.argosmodel`
  - If set, app will try to install translation package from this local file.
