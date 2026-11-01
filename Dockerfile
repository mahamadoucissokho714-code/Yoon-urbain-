# Hébergement autonome (serveur, VPS, Kubernetes) : nginx sans privilèges, site construit, en-têtes de sécurité.
#   docker build -t yoon-urbain --build-arg YOON_SITE_URL=https://exemple.org .
#   docker run -p 8080:8080 yoon-urbain        → http://localhost:8080
FROM node:20-alpine AS build
WORKDIR /app
COPY index.html config.js sw.js manifest.webmanifest ./
COPY icons ./icons
COPY css ./css
COPY js ./js
COPY scripts ./scripts
ARG YOON_ENV=production
ARG YOON_RELEASE=docker
ARG YOON_SITE_URL=
ARG YOON_REPORT_URL=
ENV YOON_ENV=$YOON_ENV YOON_RELEASE=$YOON_RELEASE YOON_SITE_URL=$YOON_SITE_URL YOON_REPORT_URL=$YOON_REPORT_URL
RUN node scripts/build.js

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /app/dist/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN rm /usr/share/nginx/html/nginx.conf
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
