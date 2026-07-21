import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { attachStudyGroupSocketServer } from "./lib/realtime/study-group-socket-server";
import { attachStudyRoomSocketServer } from "./lib/realtime/study-room-socket-server";

const isProduction = process.argv.includes("--prod");
const dev = !isProduction;
const hostname = "0.0.0.0";
const port = Number(process.env.PORT || 3000);

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url ?? "/", true);
      await handle(req, res, parsedUrl);
    } catch (error) {
      console.error("Request handling failed", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    }
  });

  attachStudyRoomSocketServer(server);
  attachStudyGroupSocketServer(server);

  server.listen(port, hostname, () => {
    const mode = dev ? "development" : "production";
    console.log(`> Ready on http://localhost:${port} (${mode} with Socket.IO)`);
  });
}

main().catch((error) => {
  console.error("Failed to start Study Room server", error);
  process.exit(1);
});
