FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend

ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE}

COPY smartbnb/frontend/package*.json ./
RUN npm ci
COPY smartbnb/frontend/ ./
RUN npm run build

FROM node:22-alpine AS backend-build
WORKDIR /app/backend
COPY smartbnb/backend/package*.json ./
RUN npm ci --omit=dev
COPY smartbnb/backend/ ./

FROM node:22-alpine
WORKDIR /app

COPY --from=backend-build /app/backend ./backend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "backend/src/server.js"]
