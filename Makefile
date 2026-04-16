.PHONY: dev test

dev:
	uvicorn app.main:app --reload

test:
	python3 -m pytest -q
