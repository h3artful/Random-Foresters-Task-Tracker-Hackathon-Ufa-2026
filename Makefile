.PHONY: dev test seed

dev:
	uvicorn app.main:app --reload

test:
	python3 -m pytest -q

seed:
	python3 -m app.seed
