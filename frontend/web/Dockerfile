# Builds the Vite SPA and leaves the static output in /out.
# We don't serve from this image — we copy /out to the host for nginx.
FROM node:22-alpine AS build

WORKDIR /web

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
ARG VITE_VAPID_PUBLIC_KEY
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
RUN npm run build

# Final tiny stage whose only job is to hold the built files at /out
FROM alpine:3.20
COPY --from=build /web/dist /out