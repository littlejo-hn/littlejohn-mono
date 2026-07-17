# LittleJohn Ponder indexer image (Fly Machines).
FROM node:22-slim

WORKDIR /app
RUN corepack enable

# Install deps first for layer caching.
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY . .
RUN pnpm codegen

ENV NODE_ENV=production
EXPOSE 42069

# `ponder start` = the single writer (also serves the API). Split out `ponder serve`
# reader Machines once API traffic warrants it (see plans/infra-architecture.md).
CMD ["pnpm", "start"]
