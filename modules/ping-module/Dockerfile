FROM node:18-alpine

# ✅ REQUIRED: Install ping utility in Alpine Linux
RUN apk update && apk add --no-cache iputils

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY src/ ./src/

CMD ["npm", "start"]