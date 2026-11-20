# Contexto de build: la RAIZ del repo (el lockfile canonico del workspace esta ahi).
# docker compose: build.context: . + build.dockerfile: frontend/Dockerfile
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY frontend/package.json ./frontend/package.json
# npm ci instala exactamente lo que dice el lockfile (falla si no cuadra con package.json)
RUN npm ci

FROM node:26-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY frontend ./frontend
WORKDIR /app/frontend
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PAYPAL_CLIENT_ID
ENV NEXT_PUBLIC_PAYPAL_CLIENT_ID=$NEXT_PUBLIC_PAYPAL_CLIENT_ID
ARG NEXT_PUBLIC_PAYPAL_MODE=sandbox
ENV NEXT_PUBLIC_PAYPAL_MODE=$NEXT_PUBLIC_PAYPAL_MODE
ARG NEXT_PUBLIC_PAYPAL_CURRENCY=MXN
ENV NEXT_PUBLIC_PAYPAL_CURRENCY=$NEXT_PUBLIC_PAYPAL_CURRENCY
RUN npm run build

FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/frontend/.next ./frontend/.next
COPY --from=builder --chown=node:node /app/frontend/package.json ./frontend/package.json
COPY --from=builder --chown=node:node /app/frontend/public ./frontend/public
WORKDIR /app/frontend
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
