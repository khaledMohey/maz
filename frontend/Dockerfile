FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=https://mazr3a-backend.fly.dev
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

RUN npm i -g serve

EXPOSE 8080

CMD ["serve", "-s", "dist", "-l", "8080"]
