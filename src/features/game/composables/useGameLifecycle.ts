import { onMounted, onScopeDispose } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import type { RouteLocationNormalized } from 'vue-router'
import { LEASE_RENEWAL_MS } from '@/storage/ownership'
import { useGameStore } from '@/features/game/stores/useGameStore'

export function useGameLifecycle() {
  const game = useGameStore()
  const router = useRouter()
  // Hiding pauses and releases editing ownership; becoming visible never resumes automatically.
  const hidden = () => {
    if (document.hidden) {
      void game.leaveGame()
    }
  }
  const exiting = () => {
    void game.leaveGame()
  }
  let timer = 0
  let saveTimer = 0
  let leaseTimer = 0
  onMounted(() => {
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', exiting)
    timer = window.setInterval(game.tick, 250)
    saveTimer = window.setInterval(() => {
      void game.periodicSave()
    }, 5000)
    leaseTimer = window.setInterval(() => {
      void game.renewLease()
    }, LEASE_RENEWAL_MS)
  })
  let leavingFor: RouteLocationNormalized | null = null
  onBeforeRouteLeave((to) => {
    leavingFor = to
  })
  const removeLeaveGuard = router.beforeResolve(async (to) => {
    // Resolve guards run after page loading; cancelled targets must not pause the current game.
    if (to !== leavingFor) {
      return
    }

    leavingFor = null
    await game.leaveGame()
  })
  onScopeDispose(() => {
    removeLeaveGuard()
    document.removeEventListener('visibilitychange', hidden)
    window.removeEventListener('pagehide', exiting)
    window.clearInterval(timer)
    window.clearInterval(saveTimer)
    window.clearInterval(leaseTimer)
    void game.leaveGame()
  })
}
