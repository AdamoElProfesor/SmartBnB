# SmartBnB: CI and deployment

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/develop.yml` | pull request to `main` | Lint, frontend build, backend tests |
| `.github/workflows/main.yml` | push to `main` | Same checks, then a GitHub release and a Docker image on GHCR |
| `.github/workflows/uptime.yml` | every 30 minutes | Checks that smartbnb.ch and its API answer |
| `.github/workflows/backup.yml` | every day | Encrypted `pg_dump` of the database, kept 30 days |

The tests mock the database and the AI, so the checks need no secrets. Only
the backup uses secrets (`BACKUP_DATABASE_URL`, `BACKUP_PASSPHRASE`, see
[OPERATIONS.md](OPERATIONS.md)).

## How a change reaches production

1. Work on a branch (`feat/...` or `fix/...`) and open a pull request.
2. The "Lint + Tests" check must pass: `main` is protected and only accepts
   changes through pull requests with a green check.
3. After the merge, Render waits for the checks on `main`, then builds
   `smartbnb/Dockerfile` and deploys. There is no deploy step in the
   workflows.

## Changing the pipeline

- New tool or runtime for the checks: add the step to the `lint-and-test` job
  of both `develop.yml` and `main.yml`, so pull requests and `main` run the
  same checks.
- New runtime environment variable for the app: set it on the Render service
  and document it in `smartbnb/backend/.env.example`.
- Version bump: `main.yml` increments the patch of the last `X.Y.Z` tag. Push
  a tag by hand for a minor or major bump.
