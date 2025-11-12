FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY src/ ./src/

# ✅ HTTP modules built into Node.js
CMD ["npm", "start"]