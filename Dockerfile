# Backend Dockerfile
FROM node:18-alpine AS backend

WORKDIR /app/backend

# Instalar Python, build tools y curl (para el healthcheck) en Alpine
RUN apk add --no-cache python3 py3-pip make g++ sqlite-dev curl

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy source code
COPY backend/ ./

# Create data directory for SQLite
RUN mkdir -p data && chmod 777 data

# Expose port
EXPOSE 3002

# Start the backend
CMD ["node", "exchange-server.js"]

# Frontend Dockerfile (separate stage)
FROM node:18-alpine AS frontend

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
