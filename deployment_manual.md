# SmartBnB — Deployment guide

This mini guide helps you run the SmartBnB Docker image or directly on machine

---

# Docker

## 1) Setup env vars

Before pulling the Docker image, you have to create a ``.env`` file with these fields :

```bash
DATA_MODE=sql
DATABASE_URL=<YOUR_DATABASE_URL>  # see data/db/README.md
# AI analysis (optional, leave empty to disable it). Either an OpenAI-compatible
# endpoint such as the Workers AI Worker (see cloudflare/README.md):
AI_BASE_URL=<YOUR_AI_ENDPOINT>/v1
AI_API_KEY=<YOUR_AI_KEY>
AI_MODEL=@cf/openai/gpt-oss-20b
# or OpenAI directly:
OPENAI_API_KEY=<YOUR_OPENAI_KEY>
VITE_API_BASE=/api
```

## 2) Pull the docker image

Once the ``.env`` file has been created, all you need to do now is pull the SmartBnB Docker image via the GitHub Registry :

### Mac

```bash
docker pull --platform linux/amd64 ghcr.io/cestpolo/smartbnb:latest
```

### Windows

```bash
docker pull ghcr.io/cestpolo/smartbnb:latest
```

### 3) Create Docker container

All you have to do now is run a Docker container :

> You can remove ``--platform linux/amd64`` if you are on Windows

```bash
# From the folder that contains your .env file
docker run --platform linux/amd64 --rm -p 3000:3000 \
  --env-file ./.env \
  --name smartbnb ghcr.io/cestpolo/smartbnb:1.0.14
```

You can now open your browser on ``http://localhost:3000``

---

# From GitHub release

## 1) Download the release

You have to go on the ``releases`` section on our repository and to download the latest zip file and unzip the this in a directory

## 2) Setup env vars

Once you have the project, you have to create 2 .env files, one in the backend and the other in frontend directory

### ``smartbnb/backend/.env``

```bash
DATA_MODE=sql
DATABASE_URL=<YOUR_DATABASE_URL>  # see data/db/README.md
# AI analysis (optional, leave empty to disable it). Either an OpenAI-compatible
# endpoint such as the Workers AI Worker (see cloudflare/README.md):
AI_BASE_URL=<YOUR_AI_ENDPOINT>/v1
AI_API_KEY=<YOUR_AI_KEY>
AI_MODEL=@cf/openai/gpt-oss-20b
# or OpenAI directly:
OPENAI_API_KEY=<YOUR_OPENAI_KEY>
```

### ``smartbnb/frontend/.env``

```bash
VITE_API_BASE=/api
```

## Setup with node.js

Now you have to download npm package and run the backend and the frontend in 2 separates shell :

> You need to have node.js 20+ version

### Frontend

```bash
cd frontend/
npm ci
npm run build
npm run dev
````

### Backend

```bash
cd backend/
npm ci
npm run dev
````

You can now open your browser on ``http://localhost:5173``

