FROM golang:1.22-alpine AS build
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod ./
RUN go mod download || true
COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server
RUN CGO_ENABLED=0 go build -o /out/hammer ./cmd/hammer

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=build /out/server /usr/local/bin/server
COPY --from=build /out/hammer /usr/local/bin/hammer
RUN mkdir -p /app/logs
ENV CH_LOG_DIR=/app/logs
EXPOSE 8080
CMD ["server"]
