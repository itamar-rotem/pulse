/** Design token constants for use in Recharts and inline SVG */

export const colors = {
  accent: '#ff6b35',
  accentDark: '#e83f5b',
  accentBg: '#fff5f0',

  green: '#10b981',
  greenBg: '#ecfdf5',
  amber: '#f59e0b',
  amberBg: '#fffbeb',
  red: '#ef4444',
  redBg: '#fef2f2',

  blue: '#3b82f6',
  blueBg: '#eff6ff',
  purple: '#8b5cf6',
  purpleBg: '#f5f3ff',

  text1: '#1a1a1a',
  text2: '#8a857d',
  text3: '#b5b0a8',
  border: '#eae8e4',
  surface: '#ffffff',
  bg: '#faf9f7',
} as const;

export const chartColors = {
  inputTokens: colors.blue,
  outputTokens: colors.purple,
  cacheRead: colors.green,
  cacheCreation: colors.amber,
  cost: colors.accent,
  burnRate: colors.red,
  grid: colors.border,
  axis: colors.text3,
} as const;
