# Base image pinned by digest (updated by Dependabot) so a retagged image
# cannot change what gets built
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS frontend-build
WORKDIR /app/frontend

ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE}

COPY smartbnb/frontend/package*.json ./
RUN npm ci
COPY smartbnb/frontend/ ./
RUN npm run build

FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS backend-build
WORKDIR /app/backend
COPY smartbnb/backend/package*.json ./
RUN npm ci --omit=dev
COPY smartbnb/backend/ ./

FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
WORKDIR /app

COPY --from=backend-build /app/backend ./backend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Run as the unprivileged user of the node image, not root
USER node

CMD ["node", "backend/src/server.js"]
