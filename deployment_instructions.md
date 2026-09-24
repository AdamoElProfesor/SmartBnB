# SmartBnB — How to update the pipeline for a new feature

This document explains how to change our GitHub actions pipelines when a feature requires it

**Workflows in use**
- PR checks: `.github/workflows/develop.yml`
- Release & deploy: `.github/workflows/main.yml` 
---

## When you should modify CI/CD
- A feature adds a new package, tool, or runtime
- A service needs new secrets or environment variables
- Deploying a new Render service or changing deploy hooks

---

## Extend PR checks (`develop.yml`)
Add steps in `jobs.lint-and-test.steps` in this order :
1) Setup tools → 2) Lint → 3) Unit tests → 4) Build

- Example: new env variables for tests :
```yaml
env:
  SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

---

## Adjust release & deploy (`main.yml`)

### 1) Versioning
The job `version-and-release` auto-bumps the patch from the last `1.0.X` tag. If you need a minor/major bump, push a tag beforehand or update the compute step

### 2) Docker image
The job `build-and-push-image` builds and pushes to GHCR. If the app structure or image name changes:
```yaml
- name: Determine image name
  run: echo "IMAGE=ghcr.io/<org>/smartbnb" >> $GITHUB_ENV
```
If you need build args:
```yaml
- name: Build & push
  uses: docker/build-push-action@v6
  with:
    push: true
    tags: ${{ env.IMAGE }}:${{ needs.version-and-release.outputs.version }}
    build-args: |
      VITE_API_BASE=/api
```

### 3) Deploy to Render
The job `deploy-render` triggers the deploy hook. For a new Render service, add another step with the new secret:
```yaml
- name: Trigger Render Deploy Hook (API)
  run: curl -fsSL "$RENDER_API_DEPLOY_HOOK"
  env:
    RENDER_API_DEPLOY_HOOK: ${{ secrets.RENDER_API_DEPLOY_HOOK }}
```

---

## Secrets & env management
- Add secrets in **Settings → Secrets and variables → Actions**.
- Reference via `${{ secrets.NAME }}`

---

