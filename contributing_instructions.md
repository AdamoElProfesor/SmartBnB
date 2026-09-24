# Contributing to SmartBnB

This document describes how contributors propose changes: branching model, PR workflow, and code review 

---

## Branching model
- Default working branch: `develop`
- Production: `main`
- Branch types:
  - `feat/<short_name>` — new features
---

## How to contribute (internal & external)
1. Fork or clone the repo.
2. Create a branch off `develop`:
   ```bash
   git checkout -b feat/<short_name>
   ```
3. Make changes and run local checks:
   ```bash
   # Frontend
   cd smartbnb/frontend
   npm ci
   npm run lint
   npm run build

   # Backend
   cd ../backend
   npm ci
   npm run lint
   npm test
   ```
4. Push and open a PR to `develop`
5. Code review: at least 1 maintainer approval
6. CI must be green

---

## Communication
- Use Issues/Discussions to propose significant changes.
- Link issues in PR. Keep PR concise
