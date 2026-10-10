# Build from the repository root:  docker build -f app/Dockerfile -t flex-app .
# The Playwright image tag must match the playwright version in skills/flex/scripts/package.json.
FROM mcr.microsoft.com/playwright:v1.64.0-noble

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg zip && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY skills/flex/scripts/package.json skills/flex/scripts/package-lock.json skills/flex/scripts/
RUN npm ci --prefix skills/flex/scripts --omit=dev
COPY app/package.json app/package-lock.json app/
RUN npm ci --prefix app --omit=dev

COPY skills/flex skills/flex
COPY app app

ENV NODE_ENV=production PORT=10000 DATA_DIR=/data FLEX_FFMPEG_PRESET=veryfast
EXPOSE 10000
WORKDIR /srv/app
CMD ["node", "src/server.mjs"]
