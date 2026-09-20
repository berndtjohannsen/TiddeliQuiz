# Build the Vite UI, then a small image that runs the Node API and serves the UI.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
# Shown in `docker inspect`; bump when the start command changes so stale :latest is obvious.
ENV TIDDELI_IMAGE=2026-09-20-noca
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY src ./src
COPY data/.gitkeep ./data/.gitkeep
# Bind-mounted ./data is easier to write as root on a home server.
RUN mkdir -p /app/data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Node 20 has no --use-system-ca. Keep this in sync with package.json "start".
CMD ["npm", "start"]
