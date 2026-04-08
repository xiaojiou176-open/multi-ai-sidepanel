const DEFAULT_BRIDGE_PORT = 48123;
const parsedPort = Number(process.env.PROMPT_SWITCHBOARD_BRIDGE_PORT ?? DEFAULT_BRIDGE_PORT);
const bridgePort = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_BRIDGE_PORT;
const bridgeBaseUrl = `http://127.0.0.1:${bridgePort}`;

try {
  const response = await fetch(`${bridgeBaseUrl}/health`);
  if (!response.ok) {
    process.stderr.write(`[docker-healthcheck] bridge health returned ${response.status}\n`);
    process.exit(1);
  }

  process.stdout.write(`[docker-healthcheck] ok ${bridgeBaseUrl}/health\n`);
} catch (error) {
  process.stderr.write(
    `[docker-healthcheck] failed to reach ${bridgeBaseUrl}/health: ${
      error instanceof Error ? error.message : String(error)
    }\n`
  );
  process.exit(1);
}
