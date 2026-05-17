FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# Dependências
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Código
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV RAW_PAYLOAD_LOCAL_PATH=/var/lib/jusradar/raw
ENV HEALTH_PORT=8080
RUN mkdir -p /var/lib/jusradar/raw

EXPOSE 8080

# tsx roda TS direto; trocar por compilação se quiser otimizar
CMD ["npx", "tsx", "src/index.ts"]
