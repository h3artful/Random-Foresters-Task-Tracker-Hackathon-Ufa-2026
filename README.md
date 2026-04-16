# Task Tracker (Hackathon MVP)

Task management service aligned with hackathon requirements.

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
