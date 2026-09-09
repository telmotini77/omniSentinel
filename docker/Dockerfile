FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run prisma:generate && npm run build

FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
RUN npx prisma generate && mkdir -p /app/storage/reports
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
