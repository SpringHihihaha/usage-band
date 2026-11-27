export type Limit = { percent: number; resetsAt?: string }
export type Usage = {
  fiveHour: Limit | null
  week: Limit | null
  context: number | null
  contextTokens: number | null
  contextWindow: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { usage: Usage | null; now: number; palette: string }
  }
}
