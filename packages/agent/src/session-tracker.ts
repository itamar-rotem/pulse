import { calculateCost, normalizeProjectSlug } from '@pulse/shared';
import type { TokenEvent, SessionType } from '@pulse/shared';
import { classifySession } from './session-classifier.js';
import type { ParsedMessage } from './claude-reader.js';

interface TrackedSession {
  sessionId: string;
  tool: 'claude_code';
  model: string;
  projectSlug: string;
  sessionType: SessionType;
  startedAt: string;
  lastActivityAt: string;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCacheCreationTokens: number;
  cumulativeCacheReadTokens: number;
  cumulativeCostUsd: number;
}

export class SessionTracker {
  private sessions = new Map<string, TrackedSession>();

  processMessage(msg: ParsedMessage): TokenEvent | null {
    let session = this.sessions.get(msg.sessionId);

    if (!session) {
      session = {
        sessionId: msg.sessionId,
        tool: 'claude_code',
        model: msg.model,
        projectSlug: normalizeProjectSlug(msg.cwd),
        sessionType: classifySession({ entrypoint: msg.entrypoint, userType: msg.userType }),
        startedAt: msg.timestamp,
        lastActivityAt: msg.timestamp,
        cumulativeInputTokens: 0,
        cumulativeOutputTokens: 0,
        cumulativeCacheCreationTokens: 0,
        cumulativeCacheReadTokens: 0,
        cumulativeCostUsd: 0,
      };
      this.sessions.set(msg.sessionId, session);
    }

    const deltaCost = calculateCost({
      model: msg.model,
      inputTokens: msg.inputTokens,
      outputTokens: msg.outputTokens,
      cacheCreationTokens: msg.cacheCreationTokens,
      cacheReadTokens: msg.cacheReadTokens,
    });

    session.cumulativeInputTokens += msg.inputTokens;
    session.cumulativeOutputTokens += msg.outputTokens;
    session.cumulativeCacheCreationTokens += msg.cacheCreationTokens;
    session.cumulativeCacheReadTokens += msg.cacheReadTokens;
    session.cumulativeCostUsd += deltaCost;
    session.model = msg.model;
    session.lastActivityAt = msg.timestamp;

    const elapsedMs = new Date(msg.timestamp).getTime() - new Date(session.startedAt).getTime();
    const elapsedMin = Math.max(elapsedMs / 60000, 0.1);
    const totalTokens = session.cumulativeInputTokens + session.cumulativeOutputTokens;
    const burnRatePerMin = totalTokens / elapsedMin;

    return {
      sessionId: msg.sessionId,
      timestamp: msg.timestamp,
      tool: 'claude_code',
      model: msg.model,
      projectSlug: session.projectSlug,
      sessionType: session.sessionType,
      inputTokens: msg.inputTokens,
      outputTokens: msg.outputTokens,
      cacheCreationTokens: msg.cacheCreationTokens,
      cacheReadTokens: msg.cacheReadTokens,
      costDeltaUsd: deltaCost,
      cumulativeInputTokens: session.cumulativeInputTokens,
      cumulativeOutputTokens: session.cumulativeOutputTokens,
      cumulativeCostUsd: session.cumulativeCostUsd,
      burnRatePerMin,
    };
  }

  getActiveSessions(): TrackedSession[] {
    return Array.from(this.sessions.values());
  }

  getSession(sessionId: string): TrackedSession | undefined {
    return this.sessions.get(sessionId);
  }

  markEnded(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
