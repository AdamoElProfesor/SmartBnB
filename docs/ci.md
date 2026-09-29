# SmartBnB: CI and deployment

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/ci.yml` | pull request to `main`, push to `main`, on demand | Frontend lint, tests and build, backend tests, data pipeline tests, check that no data file is committed, end-to-end run of the data pipeline on synthetic data in a throwaway Postgres (it must be idempotent), dbt docs (artifact `dbt-docs`) |
| `.github/workflows/data-refresh.yml` | every Monday | Loads, transforms (dbt), audits and publishes the data, archives a new snapshot in the private `SmartBnB-data` repository ([operations.md](operations.md#data-refresh)) |
| `.github/workflows/uptime.yml` | every 30 minutes | Checks that smartbnb.ch and its API answer |
| `.github/workflows/backup.yml` | every day | Encrypted `pg_dump` of the database, kept 30 days |

The app tests mock the database and the AI, and the pipeline runs on
generated data in a Postgres service container, so the checks need no secrets. Only
the backup (`BACKUP_DATABASE_URL`, `BACKUP_PASSPHRASE`) and the data refresh
(`LOADER_DATABASE_URL`) use secrets, see [operations.md](operations.md).

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
