ARG VCS_REF=local
ARG BUILD_DATE=

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
WORKDIR /app
ARG VCS_REF
ARG BUILD_DATE
ENV KIROMAIL_BUILD_COMMIT=$VCS_REF
ENV KIROMAIL_BUILD_DATE=$BUILD_DATE
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runner
WORKDIR /app
ARG VCS_REF
ARG BUILD_DATE
LABEL org.opencontainers.image.source="https://github.com/serenity-devs/kiromail" \
  org.opencontainers.image.description="KiroMail application and worker" \
  org.opencontainers.image.revision="$VCS_REF" \
  org.opencontainers.image.created="$BUILD_DATE"
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV KIROMAIL_BUILD_COMMIT=$VCS_REF
ENV KIROMAIL_BUILD_DATE=$BUILD_DATE
RUN apk add --no-cache su-exec
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/next.config.ts /app/tsconfig.json ./
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/worker ./worker
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/db ./db
COPY docker-entrypoint.sh /usr/local/bin/kiromail-entrypoint
RUN addgroup -S kiromail && adduser -S -G kiromail kiromail \
  && mkdir -p /app/uploads /app/message-content \
  && chown kiromail:kiromail /app/uploads /app/message-content \
  && chmod 0755 /usr/local/bin/kiromail-entrypoint
ENTRYPOINT ["/usr/local/bin/kiromail-entrypoint"]
EXPOSE 3000
CMD ["npm", "start"]
