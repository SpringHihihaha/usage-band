import { atom, read, update } from 'claude-code'
import type { Register, SessionRateLimit, SessionContextUsage } from 'claude-code'

import type { Limit, Usage } from '../types'

const usageAtom = atom({ plugin: 'usage-band', key: 'usage' } as const, null)
const nowAtom = atom({ plugin: 'usage-band', key: 'now' } as const, 0)
const paletteAtom = atom({ plugin: 'usage-band', key: 'palette' } as const, 'neon')

// [under 70%, 70–89%, 90% and up]
const PALETTES: Record<string, [string, string, string]> = {
  neon: ['#00f5a0', '#ffd60a', '#ff2e63'],
  ocean: ['#00d4ff', '#7b61ff', '#ff3d81'],
  sunset: ['#ffd166', '#ff8c42', '#ff3c38'],
  aurora: ['#4ade80', '#22d3ee', '#e879f9'],
  candy: ['#5eead4', '#fbbf24', '#f43f5e'],
  ember: ['#f4c095', '#e07a3f', '#d7263d'],
}

const colorOf = (palette: string, p: number) => {
  const [lo, mid, hi] = PALETTES[palette] ?? PALETTES.neon!
  return p >= 90 ? hi : p >= 70 ? mid : lo
}

const pick = (limits: SessionRateLimit[], kind: string): Limit | null => {
  const l = limits.find(r => r.kind === kind)
  return l ? { percent: l.percentUsed, resetsAt: l.resetsAt } : null
}

const toUsage = (context: SessionContextUsage, limits: SessionRateLimit[]): Usage => ({
  fiveHour: pick(limits, 'five_hour'),
  week: pick(limits, 'seven_day'),
  context: context.percent ?? null,
  contextTokens: context.tokens ?? null,
  contextWindow: context.window,
})

const until = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const m = Math.round(ms / 60000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  return d > 0 ? `↻${d}d${h}h` : h > 0 ? `↻${h}h${mm}m` : `↻${mm}m`
}

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

const PICKER = 'usage-palette'
const BAR_H = 0.4 // rows: about three times the old line glyph

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({
      name: 'usage-palette',
      description: `Color set for the usage band: ${Object.keys(PALETTES).join(', ')}`,
    })
    const saved = await $.store.get('palette')
    if (typeof saved === 'string' && saved in PALETTES) {
      await update($, paletteAtom, () => saved)
    }
    const u = await $.session.usage()
    const t = await $.clock.now()
    await update($, usageAtom, () => toUsage(u.context, u.rateLimits))
    await update($, nowAtom, () => t)
    $.clock.every(30_000, async () => {
      const t2 = await $.clock.now()
      await update($, nowAtom, () => t2)
    })
    return r
  })

  on('command.run', { command: 'usage-palette' }, async ($, e) => {
    const name = e.args.trim().toLowerCase()
    if (!(name in PALETTES)) {
      await $.ui.open({ id: PICKER, title: 'Usage band colors' })
      return { text: 'Palette picker opened.' }
    }
    await update($, paletteAtom, () => name)
    await $.store.set('palette', name)
    return { text: `Usage band palette: ${name}` }
  })

  on('session.measure', async ($, e, next) => {
    const t = await $.clock.now()
    await update($, usageAtom, () => toUsage(e.context, e.rateLimits))
    await update($, nowAtom, () => t)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PICKER }, async ($, e) => {
    const current = await read($, paletteAtom)
    const isTerminal = e.surface === 'terminal'
    const { Box, Text, Button } = $.ui.resolve(e)
    const SAMPLES: [string, number][] = [['<70%', 45], ['70–89%', 78], ['≥90%', 95]]

    const sample = (c: string, pct: number, label: string, key: string) => (
      <Box key={key} flexDirection="row" alignItems="center" gap={1} flexGrow={1}>
        <Text dimColor wrap="truncate-end">{label}</Text>
        {isTerminal ? (
          <Box flexGrow={1} height={1} backgroundColor="#333333">
            <Box width={`${pct}%`} height={1} backgroundColor={c} />
          </Box>
        ) : (
          <Box flexGrow={1} height={1} alignItems="center">
            {/* halo: a wider, translucent band of the same color behind the fill */}
            <Box position="relative" width="100%" height={0.8} alignItems="center">
              <Box position="absolute" left={0} top={0} width={`${pct}%`} height={0.8} backgroundColor={`${c}40`} />
              <Box position="absolute" left={0} top={0.2} width="100%" height={BAR_H} backgroundColor="#80808033" />
              <Box position="absolute" left={0} top={0.2} width={`${pct}%`} height={BAR_H} backgroundColor={c} />
            </Box>
          </Box>
        )}
        <Text weight="bold" color={c}>{pct}%</Text>
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>Pick a color set for the usage band. It is saved for later sessions.</Text>
        {Object.entries(PALETTES).map(([name, colors]) => (
          <Box key={`p-${name}`} flexDirection="column" gap={0} paddingX={1} paddingY={0}
            borderStyle={name === current ? 'round' : undefined}
            borderColor={name === current ? colors[0] : undefined}>
            <Box flexDirection="row" alignItems="center" gap={1}>
              <Text weight="bold">{name}</Text>
              <Text color={colors[0]}>■</Text>
              <Text color={colors[1]}>■</Text>
              <Text color={colors[2]}>■</Text>
              <Text dimColor wrap="truncate-end">{colors.join(' · ')}</Text>
              <Box flexGrow={1} />
              {name === current ? (
                <Text weight="semibold" color={colors[0]}>✓ in use</Text>
              ) : (
                <Button key={`use-${name}`} label="Use" onPress={async () => {
                  await update($, paletteAtom, () => name)
                  await $.store.set('palette', name)
                }} />
              )}
            </Box>
            <Box flexDirection="row" gap={2}>
              {SAMPLES.map(([label, pct], i) => sample(colors[i]!, pct, label, `${name}-${i}`))}
            </Box>
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const u = await read($, usageAtom)
    const palette = await read($, paletteAtom)
    const now = (await read($, nowAtom)) || (await $.clock.now())
    const isTerminal = e.surface === 'terminal'
    const { Box, Text, Button } = $.ui.resolve(e)

    const meter = (label: string, p: number | null, extra: string) => {
      const c = p === null ? '#888888' : colorOf(palette, p)
      const fill = `${Math.round(Math.max(0, Math.min(100, p ?? 0)))}%`
      return (
        <Box key={label} flexDirection="row" alignItems="center" flexGrow={1} flexShrink={1} gap={1} minWidth={0}>
          <Text weight="semibold" wrap="truncate-end">{label}</Text>
          {isTerminal ? (
            <Box flexGrow={1} height={1} backgroundColor="#333333">
              <Box width={fill} height={1} backgroundColor={c} />
            </Box>
          ) : (
            <Box flexGrow={1} height={1} alignItems="center">
              <Box position="relative" width="100%" height={BAR_H} backgroundColor="#80808033">
                {/* glow: a blurred copy of the fill under the sharp one */}
                <Box position="absolute" blur={1.2} left={0} top={0} width={fill} height={BAR_H} backgroundColor={c} />
                <Box position="absolute" left={0} top={0} width={fill} height={BAR_H} backgroundColor={c} />
              </Box>
            </Box>
          )}
          <Text weight="bold" color={p === null ? undefined : c} dimColor={p === null} wrap="truncate-end">
            {p === null ? '—' : `${Math.round(p)}%`}
          </Text>
          {extra ? <Text dimColor weight="medium" wrap="truncate-end">{extra}</Text> : null}
        </Box>
      )
    }

    return (
      <Box flexDirection="row" flexWrap="nowrap" width="100%" height={1} gap={2} overflow="hidden">
        {meter('5h', u?.fiveHour?.percent ?? null, until(u?.fiveHour?.resetsAt, now))}
        {meter('Week', u?.week?.percent ?? null, until(u?.week?.resetsAt, now))}
        {meter(
          'Context',
          u?.context ?? null,
          u?.contextTokens != null ? `${k(u.contextTokens)}/${k(u.contextWindow)}` : '',
        )}
        <Button key="palette" label="🎨" plain onPress={() => $.ui.open({ id: PICKER, title: 'Usage band colors' })} />
      </Box>
    )
  })
}
