# Stage 1: Dependencies and Build
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy all source files
COPY . .

# Backend hostname inlined by Next.js at build time
ARG INTERNAL_BACKEND_URL=http://backend:8000
ENV INTERNAL_BACKEND_URL=$INTERNAL_BACKEND_URL

# Build the Next.js application
RUN npm run build

# Stage 2: Production Runtime
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built assets and necessary files from builder stage
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

# Start Next.js server
CMD ["npm", "start"]
