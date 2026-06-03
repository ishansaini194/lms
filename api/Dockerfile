# ---- Build stage ----
FROM golang:1.25-alpine AS build

WORKDIR /src

# Cache deps first
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build the server binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server ./cmd/server

# Also build the migrate binary so we can run migrations in the same image
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/migrate ./cmd/migration

# ---- Runtime stage ----
FROM alpine:3.20

# certs for any outbound TLS; tzdata for correct timestamps
RUN apk add --no-cache ca-certificates tzdata

# Non-root user
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Binaries
COPY --from=build /out/server /app/server
COPY --from=build /out/migrate /app/migrate

# Migrations directory (the runner reads these at runtime)
COPY migrations /app/migrations

# Uploads dir — this path is bind-mounted to the host volume in compose.
# Created and owned by app so the non-root process can write.
RUN mkdir -p /app/uploads/library && chown -R app:app /app

USER app

EXPOSE 8080

CMD ["/app/server"]