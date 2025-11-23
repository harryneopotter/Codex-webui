FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source
COPY . .

# Build TypeScript
RUN npm run build

# Set default environment variables
ENV PORT=5055
ENV HOST=0.0.0.0

# Expose the port
EXPOSE 5055

# Start the server
CMD ["node", "dist/server.js"]
