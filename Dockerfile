# Multi-service setup ke liye base image
FROM node:18-alpine as base

WORKDIR /app

# Copy package files for better caching
COPY management-ui/package*.json ./management-ui/
COPY management-api/package*.json ./management-api/ 
COPY anchor-service/package*.json ./anchor-service/
COPY modules/ping-module/package*.json ./modules/ping-module/
COPY modules/dns-module/package*.json ./modules/dns-module/

# Install dependencies
RUN cd management-ui && npm install
RUN cd management-api && npm install
RUN cd anchor-service && npm install 
RUN cd modules/ping-module && npm install
RUN cd modules/dns-module && npm install

# Copy source code
COPY management-ui/ ./management-ui/
COPY management-api/ ./management-api/
COPY anchor-service/ ./anchor-service/
COPY modules/ ./modules/

# Build frontend
RUN cd management-ui && npm run build

EXPOSE 5173 3000 3001 4222

# Use a process manager
CMD ["sh", "-c", "echo 'Use railway.toml for service definitions'"]