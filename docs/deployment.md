# SmartBnB: running and deploying

SmartBnB is one Node.js service: the Express API (`smartbnb/backend`) also
serves the built Vue app (`smartbnb/frontend/dist`). It needs a Postgres
database loaded with the Inside Airbnb data.

## 1) Database

Create the schema and load the data as described in
[data/db/README.md](../data/db/README.md) (`python load_data.py --init` creates
the schema, seeds the reference tables and loads the CSVs; running only
`schema.sql` then `load_data.py` fails because the amenity references are
empty). A local Postgres or a free Supabase project both work.

## 2) Environment

```bash
cp smartbnb/backend/.env.example smartbnb/backend/.env
```

Set at least `DATABASE_URL`. The AI analysis is optional: without `AI_*` or
`OPENAI_API_KEY` the score is shown without it.

## 3) Run with Node.js

Node.js 22 is required.

```bash
# Build the frontend once (the backend serves it)
cd smartbnb/frontend
npm ci
npm run build

# Start the API and the app on http://localhost:3000
cd ../backend
npm ci
npm start
```

For frontend work with hot reload, keep the backend running and start
`npm run dev` in `smartbnb/frontend`: Vite serves the app on
http://localhost:5173 and proxies `/api` to the backend.

Backend tests: `npm test` in `smartbnb/backend`. They mock the database and
the AI, so they need no `.env`.

## 4) Run with Docker

```bash
docker build -f smartbnb/Dockerfile -t smartbnb .
docker run --rm -p 3000:3000 --env-file smartbnb/backend/.env smartbnb
```

Then open http://localhost:3000.

## Production setup

- **Render** runs the Docker image (`smartbnb/Dockerfile`) and deploys `main`
  once the GitHub checks pass. Health check: `GET /api/health`.
- **Cloudflare** serves `smartbnb.ch` through the relay Worker, runs the
  open-weights AI endpoint and the keep-alive Worker: see
  [cloudflare/README.md](../cloudflare/README.md).
- **Supabase** hosts the Postgres database.
- Monitoring and backups: [operations.md](operations.md). CI:
  [ci.md](ci.md).
