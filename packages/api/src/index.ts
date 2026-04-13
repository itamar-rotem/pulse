import { createServer } from 'http';
import { createApp } from './app.js';
import { createWsServer } from './ws-server.js';
import { redis, connectRedis } from './services/redis.js';
import { scheduler } from './services/intelligence/scheduler.js';

const port = parseInt(process.env.API_PORT || '3001', 10);
const app = createApp();
const server = createServer(app);

createWsServer(server);
connectRedis().catch(() => {});

server.listen(port, () => {
  console.log(`Pulse API running on http://localhost:${port}`);
  scheduler.start().catch((e) => console.error('Scheduler start failed:', e));
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  scheduler.stop();
  if (redis) redis.disconnect();
  server.close();
  process.exit(0);
});
