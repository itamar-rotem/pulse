import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface AgentConfig {
  apiUrl: string;
  apiKey: string;       // Org-scoped: pk_live_xxx (must be configured)
  userToken?: string;   // Optional personal token: pt_live_xxx
  localPort: number;
}

const CONFIG_DIR = join(homedir(), '.pulse');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: AgentConfig = {
  apiUrl: 'ws://localhost:3001/ws',
  apiKey: '',  // No more hardcoded default — must be configured
  localPort: 7823,
};

export function loadConfig(): AgentConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // Use defaults
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Partial<AgentConfig>): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const current = loadConfig();
  const merged = { ...current, ...config };
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
}
