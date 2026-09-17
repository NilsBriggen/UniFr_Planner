FROM node:24.7.0-alpine AS development
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM development AS build
RUN npm run build

FROM caddy:2.10.2-alpine AS production
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
EXPOSE 80
