import express from 'express';
import type { SessionTracker } from './session-tracker.js';

export function createLocalServer(tracker: SessionTracker, port: number) {
  const app = express();

  app.get('/status', (_req, res) => {
    const sessions = tracker.getActiveSessions();
    res.json({
      status: 'running',
      activeSessions: sessions.length,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/sessions/active', (_req, res) => {
    res.json(tracker.getActiveSessions());
  });

  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`Pulse agent local API at http://127.0.0.1:${port}`);
  });

  return server;
}
