PYTHON ?= python3
VENV ?= .venv
DOCKER_COMPOSE ?= docker compose
VENV_PYTHON := $(VENV)/bin/python
VENV_PIP := $(VENV)/bin/pip
VENV_UVICORN := $(VENV)/bin/uvicorn
VENV_PYTEST := $(VENV)/bin/pytest

.PHONY: setup setup-all check-venv bootstrap-translation dev dev-reload test seed clean-venv docker-build docker-up docker-down docker-logs docker-seed

setup:
	$(PYTHON) -m venv $(VENV)
	$(VENV_PYTHON) -m pip install --upgrade pip
	$(VENV_PIP) install -r requirements-dev.txt

setup-all: setup bootstrap-translation

check-venv:
	@test -x "$(VENV_PYTHON)" || (echo "Virtualenv not found. Run 'make setup' first."; exit 1)

bootstrap-translation: check-venv
	$(VENV_PYTHON) scripts/bootstrap_local_translation.py

dev: check-venv
	$(VENV_UVICORN) app.main:app

dev-reload: check-venv
	WATCHFILES_FORCE_POLLING=true $(VENV_UVICORN) app.main:app --reload

test: check-venv
	$(VENV_PYTEST) -q

seed: check-venv
	$(VENV_PYTHON) -m app.seed

clean-venv:
	rm -rf $(VENV)

docker-build:
	$(DOCKER_COMPOSE) build

docker-up:
	$(DOCKER_COMPOSE) up --build -d

docker-down:
	$(DOCKER_COMPOSE) down

docker-logs:
	$(DOCKER_COMPOSE) logs -f api

docker-seed:
	$(DOCKER_COMPOSE) exec api python -m app.seed
