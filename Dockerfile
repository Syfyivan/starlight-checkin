FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3210 DB_PATH=/var/lib/starlight/starlight.sqlite
USER node
EXPOSE 3210
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3210/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
