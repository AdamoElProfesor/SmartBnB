# SmartBnB: CI and deployment

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/ci.yml` | pull request to `main`, push to `main` | Frontend lint, tests and build, backend tests, check that `data/*.csv.gz` holds only published columns |
| `.github/workflows/uptime.yml` | every 30 minutes | Checks that smartbnb.ch and its API answer |
| `.github/workflows/backup.yml` | every day | Encrypted `pg_dump` of the database, kept 30 days |

The tests mock the database and the AI, so the checks need no secrets. Only
the backup uses secrets (`BACKUP_DATABASE_URL`, `BACKUP_PASSPHRASE`, see
[operations.md](operations.md)).

## How a change reaches production

1. Work on a branch (`feat/...` or `fix/...`) and open a pull request.
2. The "Build + Tests" check must pass: `main` is protected and only accepts
   changes through pull requests with a green check.
3. After the merge, Render waits for the checks on `main`, then builds
   `smartbnb/Dockerfile` and deploys. There is no deploy step in the
   workflows.

## Changing the pipeline

- New tool or runtime for the checks: add a step to the `build-and-test` job of
  `ci.yml`.
- New runtime environment variable for the app: set it on the Render service
  and document it in `smartbnb/backend/.env.example`.
