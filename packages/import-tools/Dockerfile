FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ ./src/
USER node
ENTRYPOINT ["npx", "tsx"]
