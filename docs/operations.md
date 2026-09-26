# Operations

How https://www.smartbnb.ch is kept up, watched and backed up. Everything runs
on free tiers: Cloudflare Workers, Render (web service), Supabase (Postgres 17)
and GitHub Actions.

## Keep-alive

The Cloudflare Worker `smartbnb-keepalive` ([cloudflare/keepalive](../cloudflare/keepalive))
calls `GET /api/health` every 10 minutes through a Cron Trigger. That keeps:

- the Render free service awake (it sleeps after about 15 minutes idle, and a
  cold start takes 10 to 60 s);
- the Supabase free project active (it is paused after 7 days without activity).

Logs: Cloudflare dashboard, Workers & Pages, `smartbnb-keepalive`, Logs.

## Uptime checks and alerts

[.github/workflows/uptime.yml](../.github/workflows/uptime.yml) runs every 30
minutes (and on demand from the Actions tab). It checks that:

- `https://www.smartbnb.ch/` answers 200 and contains the app title;
- `https://www.smartbnb.ch/api/histogram` answers 200 with valid JSON.

Each URL gets 3 attempts with a 60 s timeout, so a cold start is not reported
as an outage. No secret is needed.

**Where alerts go:** when a run fails, GitHub emails the repository owner
(default notification settings: Settings, Notifications, GitHub Actions,
"Notify me for failed workflows only"). Scheduled workflows are disabled by
GitHub after 60 days without repository activity; re-enable them from the
Actions tab if that happens.

## Data refresh

[.github/workflows/data-refresh.yml](../.github/workflows/data-refresh.yml)
runs every Monday at 05:23 UTC (and on demand from the Actions tab):

1. `load_data.py --fetch` downloads the newest Inside Airbnb snapshot if
   there is one, loads it, recomputes prices and stats (including the prices
   collected by `data/prices`), audits the result and publishes it only if
   no blocking check fails (see [Data quality](../data/db/README.md#data-quality)).
2. A new snapshot file is pushed to a `data/snapshot-<date>` branch, whose
   pull request is merged once "Build + Tests" passes. A pull request opened
   with the workflow token does not trigger workflows, so the job starts CI
   on the branch itself (`workflow_dispatch`).

**Alerts:** the run fails, and GitHub emails the repository owner, when the
load is blocked, crashes, or is published with warnings (for example data
older than 45 days). The run summary shows every check. Past runs are in the
`etl_runs` table.

It connects as `smartbnb_loader` (secret `LOADER_DATABASE_URL`, Supabase
session pooler), which cannot drop tables or change the collected prices.
The repository setting "Allow GitHub Actions to create and approve pull
requests" must stay on for step 2.

## Database backups

[.github/workflows/backup.yml](../.github/workflows/backup.yml) runs every day at
03:17 UTC (and on demand). It runs `pg_dump` 17 from the official `postgres:17`
image on the `public` schema, in custom format with maximum compression, checks
that the dump is readable with `pg_restore --list`, encrypts it with GPG
(AES-256), then proves the encrypted file restores: it decrypts it, restores it
into an empty Postgres 17 container and compares the row count of every table
with the source (the run fails if a table is missing or more than 1 % behind).
The encrypted dump is uploaded as a workflow artifact kept for **30 days**.
Artifacts of a public repository can be downloaded by anyone, so the dump is
never uploaded in clear, and anyone can try to guess the passphrase offline:
it must be long and random (`openssl rand -base64 32`), never a word or phrase.

It needs two repository secrets. `BACKUP_PASSPHRASE` encrypts the dump: keep a
copy somewhere safe, without it the backups cannot be read.
`BACKUP_DATABASE_URL` is the Supabase **session pooler** URL (port **5432**,
with `?sslmode=require`). The transaction pooler
(port 6543) does not work with `pg_dump`.

A failed backup emails the repository owner, like the uptime check. A backup
that does not run at all (for example when GitHub disables the schedule after
60 days without activity) sends nothing, so the workflow also pings
`BACKUP_HEALTHCHECK_URL` (optional secret) after each successful run: create a
free daily check on [healthchecks.io](https://healthchecks.io) with a grace
period of a few hours, and it emails when a ping is missing.

### Restore

1. Actions tab, "Database backup", pick a successful run, download the artifact,
   unzip it to get `smartbnb-public-<date>.dump.gpg` and decrypt it with the
   `BACKUP_PASSPHRASE`:

   ```bash
   gpg --output smartbnb-public-<date>.dump --decrypt smartbnb-public-<date>.dump.gpg
   ```

2. Restore with a Postgres 17 client (for example `docker run --rm -it -v
   "$PWD:/b" postgres:17 bash`), using the session pooler URL of the target
   database:

   ```bash
   # Inspect the content first
   pg_restore --list smartbnb-public-<date>.dump

   # Replace the public schema objects contained in the dump
   pg_restore --dbname "$BACKUP_DATABASE_URL" --clean --if-exists \
     --no-owner --no-privileges --single-transaction smartbnb-public-<date>.dump
   ```

   To restore a single table, add `--table <name>`. To restore into a fresh
   Supabase project, drop `--clean --if-exists`.

## Visitor analytics

Page views are counted with Cloudflare Web Analytics (dashboard: Analytics &
Logs > Web Analytics > www.smartbnb.ch). It uses no cookies and stores no
personal data, so no consent banner is needed. The beacon is loaded by
`smartbnb/frontend/src/lib/analytics.js` only on `www.smartbnb.ch`, so local
runs and forks do not report to the dashboard. The Content-Security-Policy in
`smartbnb/backend/src/server.js` allows `static.cloudflareinsights.com` and
`cloudflareinsights.com` for it.

## Cloudflare zone settings

Set on the `smartbnb.ch` zone (SSL/TLS in the dashboard):

- Minimum TLS version: 1.2
- Always Use HTTPS: on
- HSTS: enabled, max-age 1 year, include subdomains, no preload, nosniff on
