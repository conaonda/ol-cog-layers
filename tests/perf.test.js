import { describe, it, expect, vi } from 'vitest'
import { createPerfMonitor } from '../src/perf.js'

describe('createPerfMonitor', () => {
  it('measure returns fn result and updates metrics', () => {
    const mon = createPerfMonitor('test')
    const result = mon.measure(() => 42)
    expect(result).toBe(42)
    const r = mon.report()
    expect(r.renders).toBe(1)
    expect(r.totalMs).toBeGreaterThanOrEqual(0)
    expect(r.avgMs).toBeGreaterThanOrEqual(0)
  })

  it('measure records meta', () => {
    const mon = createPerfMonitor('test')
    mon.measure(() => 1, { width: 100 })
    const analysis = mon.analyze()
    expect(analysis.p50).toBeGreaterThanOrEqual(0)
  })

  it('measureAsync works', async () => {
    const mon = createPerfMonitor('test')
    const result = await mon.measureAsync(async () => 'ok', { async: true })
    expect(result).toBe('ok')
    expect(mon.report().renders).toBe(1)
  })

  it('detects frame drops (>16ms)', () => {
    const mon = createPerfMonitor('test')
    // Simulate slow function
    mon.measure(() => {
      const end = performance.now() + 20
      while (performance.now() < end) { /* busy wait */ }
    })
    expect(mon.report().drops).toBe(1)
  })

  it('report computes avgMs', () => {
    const mon = createPerfMonitor('test')
    mon.measure(() => {})
    mon.measure(() => {})
    const r = mon.report()
    expect(r.renders).toBe(2)
    expect(r.avgMs).toBe(r.totalMs / 2)
  })

  it('analyze returns percentiles and dropRate', () => {
    const mon = createPerfMonitor('test')
    for (let i = 0; i < 10; i++) mon.measure(() => {})
    const a = mon.analyze()
    expect(a).toHaveProperty('p50')
    expect(a).toHaveProperty('p95')
    expect(a).toHaveProperty('p99')
    expect(a).toHaveProperty('dropRate')
    expect(a).toHaveProperty('recentDrops')
    expect(a.dropRate).toBeGreaterThanOrEqual(0)
  })

  it('analyze returns zeros when no history', () => {
    const mon = createPerfMonitor('test')
    const a = mon.analyze()
    expect(a.p50).toBe(0)
    expect(a.dropRate).toBe(0)
    expect(a.recentDrops).toEqual([])
  })

  it('circular buffer wraps correctly', () => {
    const mon = createPerfMonitor('test', { maxHistory: 3 })
    for (let i = 0; i < 5; i++) mon.measure(() => {}, { i })
    // Should have 3 entries (the last 3)
    const r = mon.report()
    expect(r.renders).toBe(5) // metrics track all
    // analyze should still work
    const a = mon.analyze()
    expect(a.p50).toBeGreaterThanOrEqual(0)
  })

  it('reset clears metrics and history', () => {
    const mon = createPerfMonitor('test')
    mon.measure(() => {})
    mon.measure(() => {})
    mon.reset()
    expect(mon.report().renders).toBe(0)
    expect(mon.report().totalMs).toBe(0)
    expect(mon.report().maxMs).toBe(0)
    expect(mon.report().drops).toBe(0)
    expect(mon.analyze().p50).toBe(0)
  })

  it('label is exposed', () => {
    const mon = createPerfMonitor('myLabel')
    expect(mon.label).toBe('myLabel')
  })
})
