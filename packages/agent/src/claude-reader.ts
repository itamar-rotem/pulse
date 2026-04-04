import { watch } from 'chokidar';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { EventEmitter } from 'events';

export interface ParsedMessage {
  sessionId: string;
  timestamp: string;
  model: string;
  cwd: string;
  entrypoint: string;
  userType: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export function getSessionDir(): string {
  return join(homedir(), '.claude', 'projects');
}

export function extractUsage(usage: Record<string, number>): UsageData {
  return {
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    cacheCreationTokens: usage.cache_creation_input_tokens || 0,
    cacheReadTokens: usage.cache_read_input_tokens || 0,
  };
}

export function parseJsonlLine(line: string): ParsedMessage | null {
  try {
    const entry = JSON.parse(line);
    if (entry.type !== 'assistant') return null;
    if (!entry.message?.usage) return null;
    const usage = extractUsage(entry.message.usage);
    return {
      sessionId: entry.sessionId || '',
      timestamp: entry.timestamp || new Date().toISOString(),
      model: entry.message.model || 'unknown',
      cwd: entry.cwd || '',
      entrypoint: entry.entrypoint || '',
      userType: entry.userType || '',
      ...usage,
    };
  } catch {
    return null;
  }
}

export class ClaudeCodeReader extends EventEmitter {
  private fileOffsets = new Map<string, number>();
  private watcher: ReturnType<typeof watch> | null = null;

  start(): void {
    const sessionsDir = getSessionDir();
    console.log(`Watching Claude Code sessions at: ${sessionsDir}`);

    this.watcher = watch(join(sessionsDir, '**/*.jsonl'), {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    this.watcher.on('add', (filePath) => this.processFile(filePath));
    this.watcher.on('change', (filePath) => this.processFile(filePath));
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  private async processFile(filePath: string): Promise<void> {
    try {
      const fileStats = await stat(filePath);
      const currentOffset = this.fileOffsets.get(filePath) || 0;
      if (fileStats.size <= currentOffset) return;

      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      let charCount = 0;
      for (const line of lines) {
        charCount += line.length + 1;
        if (charCount <= currentOffset) continue;
        if (!line.trim()) continue;

        const parsed = parseJsonlLine(line);
        if (parsed) {
          this.emit('message', parsed);
        }
      }

      this.fileOffsets.set(filePath, fileStats.size);
    } catch {
      // File may be in the middle of being written
    }
  }
}
