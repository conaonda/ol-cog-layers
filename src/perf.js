export function createPerfMonitor(label = 'COGImageLayer', { maxHistory = 500 } = {}) {
  const metrics = { renders: 0, totalMs: 0, maxMs: 0, drops: 0 }
  const history = []
  let historyHead = 0
  let historyFull = false

  function pushEntry(entry) {
    if (historyFull) {
      history[historyHead] = entry
      historyHead = (historyHead + 1) % maxHistory
    } else {
      history.push(entry)
      if (history.length === maxHistory) {
        historyHead = 0
        historyFull = true
      }
    }
  }

  function record(elapsed, meta) {
    metrics.renders++
    metrics.totalMs += elapsed
    if (elapsed > metrics.maxMs) metrics.maxMs = elapsed
    const dropped = elapsed > 16
    if (dropped) metrics.drops++
    pushEntry({ timestamp: performance.now(), elapsedMs: elapsed, dropped, meta: meta || null })
  }

  function measure(fn, meta) {
    const start = performance.now()
    const result = fn()
    record(performance.now() - start, meta)
    return result
  }

  async function measureAsync(fn, meta) {
    const start = performance.now()
    const result = await fn()
    record(performance.now() - start, meta)
    return result
  }

  function getHistory() {
    if (!historyFull) return history.slice()
    return history.slice(historyHead).concat(history.slice(0, historyHead))
  }

  function analyze() {
    const ordered = getHistory()
    const len = ordered.length
    if (len === 0) return { p50: 0, p95: 0, p99: 0, dropRate: 0, recentDrops: [] }

    const sorted = ordered.map(e => e.elapsedMs).sort((a, b) => a - b)
    const percentile = (p) => sorted[Math.min(Math.floor(p / 100 * len), len - 1)]

    const dropRate = metrics.renders ? metrics.drops / metrics.renders : 0

    // Identify recent drop streaks (last 100 entries)
    const recent = ordered.slice(-100)
    const recentDrops = []
    let streak = null
    for (let i = 0; i < recent.length; i++) {
      const e = recent[i]
      if (e.dropped) {
        if (!streak) streak = { start: i, count: 0, maxMs: 0 }
        streak.count++
        if (e.elapsedMs > streak.maxMs) streak.maxMs = e.elapsedMs
      } else if (streak) {
        streak.end = i - 1
        recentDrops.push(streak)
        streak = null
      }
    }
    if (streak) { streak.end = recent.length - 1; recentDrops.push(streak) }

    return { p50: percentile(50), p95: percentile(95), p99: percentile(99), dropRate, recentDrops }
  }

  function report() {
    return {
      ...metrics,
      avgMs: metrics.renders ? (metrics.totalMs / metrics.renders) : 0
    }
  }

  function reset() {
    Object.assign(metrics, { renders: 0, totalMs: 0, maxMs: 0, drops: 0 })
    history.length = 0
    historyHead = 0
    historyFull = false
  }

  return { measure, measureAsync, report, reset, analyze, label }
}
