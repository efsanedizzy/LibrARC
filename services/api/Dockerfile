FROM rust:1.88-slim AS builder
WORKDIR /app
COPY services/api/Cargo.toml services/api/Cargo.toml
COPY services/api/src services/api/src
WORKDIR /app/services/api
RUN cargo build --release

FROM debian:bookworm-slim AS runner
WORKDIR /app
COPY --from=builder /app/services/api/target/release/librarc-api /usr/local/bin/librarc-api
EXPOSE 8080
CMD ["librarc-api"]
