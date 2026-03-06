import { loadConfig } from "./config/loader";
import { createGateway, type Gateway } from "./gateway";
import { createLogger } from "./logger";

const log = createLogger("main");

let gateway: Gateway | null = null;

async function main(): Promise<void> {
  try {
    const config = loadConfig();
    gateway = createGateway(config);
    await gateway.start();
  } catch (error) {
    log.error("Failed to start OpenCrow", error);
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  if (gateway) {
    await gateway.stop();
    gateway = null;
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("unhandledRejection", (reason) => {
  log.error("Unhandled promise rejection (non-fatal)", { error: reason });
});

process.on("uncaughtException", (error) => {
  log.error("Uncaught exception (non-fatal)", {
    error: error.message,
    stack: error.stack,
  });
});

main();
