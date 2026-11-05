FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN FFMPEG_BIN=/usr/bin/ffmpeg npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=4318 JINGXU_HOST=0.0.0.0 JINGXU_DATA_DIR=/data JINGXU_FFMPEG=/usr/bin/ffmpeg
VOLUME /data
EXPOSE 4318
USER node
CMD ["node","dist/server.mjs"]
