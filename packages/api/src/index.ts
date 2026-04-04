import { createServer } from 'http';
import { createApp } from './app.js';
import { createWsServer } from './ws-server.js';
import { redis, connectRedis } from './services/redis.js';

const port = parseInt(process.env.API_PORT || '3001', 10);
const app = createApp();
const server = createServer(app);

createWsServer(server);
connectRedis().catch(() => {});

server.listen(port, () => {
  console.log(`Pulse API running on http://localhost:${port}`);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  redis.disconnect();
  server.close();
  process.exit(0);
});
