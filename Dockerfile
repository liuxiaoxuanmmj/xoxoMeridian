FROM node:22-alpine AS app

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://xoxo:xoxo_password@postgres:5432/xoxo_meridian?schema=public"
ENV DIRECT_URL="postgresql://xoxo:xoxo_password@postgres:5432/xoxo_meridian?schema=public"

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
