# Backend Dockerfile — NestJS + Prisma
FROM node:24-alpine AS backend

WORKDIR /app/backend

# Instalar Python, build tools y curl (para el healthcheck) en Alpine
RUN apk add --no-cache python3 py3-pip make g++ sqlite-dev curl

# Copy package files
COPY backend/package*.json ./

# Install dependencies (dev incluido para poder compilar con tsc).
# En docker no aplica el NODE_ENV=production de omission de devs.
RUN npm install

# Copy source code
COPY backend/ ./

# Generar el Prisma Client y compilar TypeScript a dist/
RUN npx prisma generate && npx tsc -p tsconfig.json

# Create data directory for SQLite
RUN mkdir -p data && chmod 777 data
RUN mkdir -p prisma && chmod 777 prisma

# Aplicar migraciones de Prisma al arrancar (idempotente) y levantar la API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]

# Expose port
EXPOSE 3002

# Frontend Dockerfile (separate stage)
FROM node:24-alpine AS frontend

WORKDIR /app/frontend

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy source code
COPY frontend/ ./

# Build the frontend
RUN npm run build

# Expose port
EXPOSE 3000

# Start the frontend
CMD ["npm", "start"]
