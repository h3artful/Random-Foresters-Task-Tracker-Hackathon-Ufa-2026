# Task Tracker (Hackathon MVP)

Task management service aligned with hackathon requirements.

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

## Local RU->EN translation for ML ETA
- ETA model expects English task text.
- If task title/description contains Cyrillic, backend tries local `ru -> en` translation via `argostranslate`.
- No external translation APIs are used in runtime.
- To enable translation, install Argos language package `ru -> en` locally.
- One-time bootstrap command:
  - `.venv/bin/python scripts/bootstrap_local_translation.py`
- Optional env var: `ARGOS_RU_EN_PACKAGE_PATH=/absolute/path/to/ru_en.argosmodel`
  - When set, service will try to install the package from that local file on first use.
