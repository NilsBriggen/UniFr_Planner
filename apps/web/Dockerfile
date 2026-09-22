FROM node:24.7.0-alpine@sha256:be4d5e92ac68483ec71440bf5934865b4b7fcb93588f17a24d411d15f0204e4f AS development
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web
COPY packages/domain packages/domain
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM development AS build
COPY scripts/check-web-budget.mjs scripts/check-web-budget.mjs
RUN npm run build

FROM caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d AS production
ARG RELEASE_ID=development
LABEL org.opencontainers.image.revision=$RELEASE_ID
RUN setcap -r /usr/bin/caddy
COPY deploy/Caddy.web /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
USER 10001:10001
EXPOSE 8080
