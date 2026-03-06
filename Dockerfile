FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# data/ is mounted as a volume at runtime — not baked into the image
# The app creates data/db.json automatically on first start if missing

EXPOSE 3270

CMD ["node", "backend/server.js"]
