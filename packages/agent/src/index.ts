#!/usr/bin/env node
import { Command } from 'commander';
import { ClaudeCodeReader } from './claude-reader.js';
import { SessionTracker } from './session-tracker.js';
import { TelemetryStreamer } from './telemetry-streamer.js';
import { createLocalServer } from './local-server.js';
import { loadConfig } from './config.js';

const program = new Command();

program
  .name('pulse-agent')
  .description('Pulse AI Dev Health Monitor — local agent')
  .version('0.1.0');

program
  .command('start')
  .description('Start monitoring Claude Code sessions')
  .option('--api-url <url>', 'Pulse API WebSocket URL')
  .option('--api-key <key>', 'Pulse API key (org-scoped)')
  .option('--user-token <token>', 'Personal user token (optional)')
  .option('--port <number>', 'Local REST API port', '7823')
  .action(async (opts) => {
    const config = loadConfig();
    const apiUrl = opts.apiUrl || config.apiUrl;
    const apiKey = opts.apiKey || process.env.PULSE_API_KEY || config.apiKey || process.env.AGENT_API_KEY || '';
    const userToken = opts.userToken || process.env.PULSE_USER_TOKEN || config.userToken;
    const port = parseInt(opts.port) || config.localPort;

    if (!apiKey) {
      console.error('Error: --api-key is required (or set PULSE_API_KEY env var, or configure via `pulse-agent configure`)');
      process.exit(1);
    }
    void userToken; // Reserved for future per-user attribution

    console.log('Starting Pulse agent...');

    const tracker = new SessionTracker();
    const streamer = new TelemetryStreamer(apiUrl, apiKey);
    const reader = new ClaudeCodeReader();

    streamer.connect();
    const localServer = createLocalServer(tracker, port);

    const knownSessions = new Set<string>();

    reader.on('message', (msg) => {
      if (!knownSessions.has(msg.sessionId)) {
        knownSessions.add(msg.sessionId);
        const session = tracker.processMessage(msg);
        if (session) {
          streamer.sendSessionStart({
            id: msg.sessionId,
            tool: 'claude_code',
            projectSlug: session.projectSlug,
            sessionType: session.sessionType,
            model: msg.model,
          });
        }
      }

      const event = tracker.processMessage(msg);
      if (event) {
        streamer.sendTokenEvent(event);
        const session = tracker.getSession(msg.sessionId);
        if (session) {
          process.stdout.write(
            `\r[${session.projectSlug}] ${session.sessionType} | ` +
            `$${session.cumulativeCostUsd.toFixed(4)} | ` +
            `${(event.burnRatePerMin).toFixed(0)} tok/min`
          );
        }
      }
    });

    reader.start();
    console.log('Pulse agent running. Press Ctrl+C to stop.');

    process.on('SIGINT', () => {
      console.log('\nStopping Pulse agent...');
      reader.stop();
      streamer.disconnect();
      localServer.close();
      process.exit(0);
    });
  });

program
  .command('status')
  .description('Check agent status')
  .option('--port <number>', 'Local REST API port', '7823')
  .action(async (opts) => {
    const port = opts.port || 7823;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/status`);
      const data = await res.json();
      console.log('Agent status:', JSON.stringify(data, null, 2));
    } catch {
      console.log('Agent is not running.');
    }
  });

program.parse();
