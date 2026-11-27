import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

test('measure shows 5h, week and context on every surface', async ($, on) => {
  on('clock.now', () => ({ value: 0 }))
  on('command.register', () => ({ value: { command: 'usage-palette' } }))
  on('store.get', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({
    context: { window: 200000, tokens: 50000, percent: 25 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 42 },
      { kind: 'seven_day', percentUsed: 91.5 },
    ],
    changed: ['context', 'rateLimits'],
  })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as any)
    expect((await ui.find({ type: 'Text', text: /^42%$/ }))?.text).toBe('42%')
    expect((await ui.find({ type: 'Text', text: /^92%$/ }))?.text).toBe('92%')
    expect((await ui.find({ type: 'Text', text: /^25%$/ }))?.text).toBe('25%')
    expect((await ui.find({ type: 'Text', text: /50k\/200k/ }))).toBeTruthy()
    await ui.unmount()
  }
})

test('the picker shows every palette and Use switches it', async ($, on) => {
  on('clock.now', () => ({ value: 0 }))
  on('store.set', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const PANE = {
    plugin: 'usage-band', component: 'Pane', requestId: 'usage-palette',
    props: { title: 'Usage band colors', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  } as const
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface } as any)
    for (const n of ['neon', 'ocean', 'sunset', 'aurora', 'candy', 'ember']) {
      expect(await ui.find({ type: 'Text', text: new RegExp(`^${n}$`) })).toBeTruthy()
    }
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  await ui.press({ key: 'use-ocean' })
  expect(await ui.find({ key: 'use-neon' })).toBeTruthy()
  expect(await ui.find({ key: 'use-ocean' })).toBeFalsy()
  await ui.unmount()
})
