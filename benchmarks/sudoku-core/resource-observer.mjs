import { spawnSync } from 'node:child_process'

/** ps reports KiB; include descendants and exclude unrelated host processes. */
export function processTreeBytes(snapshot, rootPid) {
  const rows = snapshot
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number))
  if (!rows.some(([pid]) => pid === rootPid)) throw new Error('Browser process is unavailable')
  const owned = new Set([rootPid])
  let changed = true
  while (changed) {
    changed = false
    for (const [pid, parent] of rows) {
      if (owned.has(parent) && !owned.has(pid)) {
        owned.add(pid)
        changed = true
      }
    }
  }
  return rows.filter(([pid]) => owned.has(pid)).reduce((sum, [, , rss]) => sum + rss * 1024, 0)
}

function residentBytes(pid) {
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error('Host process memory observation is unavailable')
  return processTreeBytes(result.stdout, pid)
}

/** Independent process observations complement per-instance allocator and ownership counters. */
export async function observeResources({ name, browserServer, page, asset }) {
  const pid = browserServer.process().pid
  if (!pid || !['darwin', 'linux'].includes(process.platform)) {
    return {
      observation: { available: false, reason: 'Process-tree RSS unsupported on this host' },
      cycles: [],
    }
  }
  let cdp = null
  const snapshots = []
  const samples = []
  const sampleErrors = []
  const cycles = []
  let timer
  try {
    if (name === 'chromium') cdp = await page.context().newCDPSession(page)
    async function snapshot(label) {
      let heap = {
        available: false,
        reason: 'Forced collection and heap observation unsupported by this browser',
      }
      if (cdp) {
        try {
          await cdp.send('HeapProfiler.collectGarbage')
          heap = {
            available: true,
            afterForcedCollection: true,
            ...(await cdp.send('Runtime.getHeapUsage')),
          }
        } catch (error) {
          heap = { available: false, reason: error.message }
        }
      }
      snapshots.push({ label, processTreeRssBytes: residentBytes(pid), heap })
    }
    await snapshot('before-lifecycle-warmup')
    // Sampling runs only during resource phases, never alongside latency or throughput measurement.
    timer = setInterval(() => {
      try {
        samples.push(residentBytes(pid))
      } catch (error) {
        sampleErrors.push(error.message)
      }
    }, 50)
    for (const label of ['after-20-main-and-worker-cycles', 'after-40-main-and-worker-cycles']) {
      cycles.push(
        await page.evaluate((asset) => globalThis.sudokuReleaseAudit.resourceCycles(asset), asset),
      )
      await new Promise((resolve) => setTimeout(resolve, 200))
      await snapshot(label)
    }
    const rss = snapshots.map((entry) => entry.processTreeRssBytes)
    return {
      observation: {
        available: true,
        browserPid: pid,
        snapshots,
        sampledPeakProcessTreeRssBytes: Math.max(...rss, ...samples),
        sampleCount: samples.length,
        sampleErrors,
        retainedDeltaAfterWarmupBytes: rss[2] - rss[1],
        scope:
          'Browser process tree; includes renderer/Worker/native resources. Sampled peak, not an OS high-water mark. RSS deltas alone do not prove garbage collection.',
      },
      cycles,
    }
  } catch (error) {
    return {
      observation: {
        available: false,
        reason: error.message,
        snapshots,
        samples: samples.length,
        sampleErrors,
      },
      cycles,
    }
  } finally {
    clearInterval(timer)
    await cdp?.detach()
  }
}
