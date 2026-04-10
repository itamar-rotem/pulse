import { Router, IRouter } from 'express';
import {
  startSession,
  updateSession,
  endSession,
  getSessionHistory,
  getSessionById,
  pauseSession,
  resumeSession,
} from '../services/session-service.js';

export const sessionsRouter: IRouter = Router();

sessionsRouter.post('/start', async (req, res) => {
  try {
    const session = await startSession(req.body, req.prisma!);
    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

sessionsRouter.post('/update', async (req, res) => {
  try {
    const result = await updateSession(req.body, req.prisma!);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

sessionsRouter.post('/end', async (req, res) => {
  try {
    const session = await endSession(req.body.sessionId, req.prisma!);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

sessionsRouter.get('/history', async (req, res) => {
  try {
    const result = await getSessionHistory(req.query as Record<string, string>, req.prisma!);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

sessionsRouter.get('/:id', async (req, res) => {
  try {
    const session = await getSessionById(req.params.id, req.prisma!);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

sessionsRouter.post('/:id/pause', async (req, res) => {
  try {
    const session = await pauseSession(req.params.id, req.prisma!);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

sessionsRouter.post('/:id/resume', async (req, res) => {
  try {
    const session = await resumeSession(req.params.id, req.prisma!);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
