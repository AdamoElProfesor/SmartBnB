# Contributing to SmartBnB

Thanks for your interest! Bug reports, ideas and pull requests are all
welcome, whether you fix a typo or rework the score.

## Where to start

- Browse the [open issues](https://github.com/AdamoElProfesor/SmartBnB/issues).
  Issues labelled
  [`good first issue`](https://github.com/AdamoElProfesor/SmartBnB/labels/good%20first%20issue)
  are small and self-contained.
- Found a bug or have an idea? [Open an issue](https://github.com/AdamoElProfesor/SmartBnB/issues/new/choose)
  first for anything bigger than a small fix, so we can agree on the approach
  before you spend time on it.
- Security problem? Do not open a public issue, see [SECURITY.md](SECURITY.md).

## Set up the project

You need Node.js 22. Full details are in [docs/deployment.md](docs/deployment.md).

```bash
git clone https://github.com/AdamoElProfesor/SmartBnB.git
cd SmartBnB

# Backend tests: no database or API key needed
cd smartbnb/backend
npm ci
npm test

# Frontend lint, tests and build
cd ../frontend
npm ci
npm run lint
npm test
npm run build
```

To run the whole app you also need a Postgres database loaded with the data:
[data/db/README.md](data/db/README.md) explains how to build one from the
snapshots in `data/`.

## Make a change

1. Fork the repository and create a branch from `main`:
   `feat/<short-name>` for a feature, `fix/<short-name>` for a bug fix.
2. Keep the change focused on one thing, and add or update tests in
   `smartbnb/backend/test` or `smartbnb/frontend/test` when you change
   behaviour. Logic worth testing goes in `smartbnb/frontend/src/lib`, so it
   can be tested without a browser.
3. Make sure `npm test` (backend) and `npm run lint`, `npm test` and
   `npm run build` (frontend) pass.
4. Open a pull request against `main` and describe what changed and how you
   checked it. The **Build + Tests** check must pass before it can be merged.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/), in
English and in the imperative mood:

- `feat: add a shareable result link`
- `fix: clear the previous result when a check fails`
- `docs:`, `style:`, `refactor:`, `test:`, `chore:` for the rest

## Project layout

| Folder | Content |
|---|---|
| `smartbnb/frontend` | Vue 3 + Vite app |
| `smartbnb/backend` | Express API, SmartScore and AI analysis |
| `data` | Inside Airbnb snapshots and the database loader |
| `cloudflare` | Cloudflare Workers (relay, AI endpoint, keep-alive) |
| `docs` | Deployment, API, CI and operations guides |

## Code of conduct

Be kind and assume good intent. Harassment or personal attacks are not
tolerated in issues, pull requests or discussions.
