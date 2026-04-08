FROM node:22-bookworm-slim

WORKDIR /app

LABEL org.opencontainers.image.title="Prompt Switchboard MCP Sidecar"
LABEL org.opencontainers.image.description="Containerized local Prompt Switchboard MCP sidecar and operator helper."
LABEL org.opencontainers.image.source="https://github.com/xiaojiou176-open/multi-ai-sidepanel"
LABEL org.opencontainers.image.licenses="MIT"
LABEL io.modelcontextprotocol.server.name="io.github.xiaojiou176-open/prompt-switchboard"

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --ignore-scripts; else npm install --ignore-scripts; fi

COPY . .

ENV PROMPT_SWITCHBOARD_BRIDGE_HOST=0.0.0.0
ENV PROMPT_SWITCHBOARD_BRIDGE_PORT=48123

EXPOSE 48123

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["node", "docker/healthcheck.mjs"]

ENTRYPOINT ["node", "docker/entrypoint.mjs"]
CMD ["server"]
