import { onMounted, onScopeDispose, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import type { RouteLocationNormalized } from 'vue-router'
import { LEASE_RENEWAL_MS } from '@/storage/ownership'
import { useGameStore } from '@/features/game/stores/useGameStore'

export function useGameLifecycle() {
  const game = useGameStore()
  const router = useRouter()
  const departing = ref(false)
  let departureTarget: RouteLocationNormalized | null = null
  let leavingFor: RouteLocationNormalized | null = null

  const clearPresentation = () => {
    // Keep unresolved destinations guarded even if a background save fails.
    departing.value = false
    departureTarget = null
  }

  const clearDeparture = () => {
    clearPresentation()
    leavingFor = null
  }

  // Hiding pauses and releases editing ownership; becoming visible never resumes automatically.
  const hidden = () => {
    if (document.hidden) {
      clearPresentation()
      void game.leaveGame()
    }
  }

  const exiting = () => {
    clearPresentation()
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

  onBeforeRouteLeave((to) => {
    leavingFor = to
  })

  onBeforeRouteUpdate((to, from) => {
    const scopeChanged = to.path !== from.path || to.query.practice !== from.query.practice
    const requestChanged =
      to.query.session !== from.query.session || to.query.variant !== from.query.variant
    // Installing a game updates its URL afterward; that bookkeeping must not pause the new game.
    const installedSession =
      !!game.session &&
      to.query.session === game.session.id &&
      (to.query.variant ?? 'classic') === game.activeVariant
    if (scopeChanged || (requestChanged && !installedSession)) {
      leavingFor = to
    } else {
      clearDeparture()
    }
  })

  const removeLeaveGuard = router.beforeResolve(async (to) => {
    // Resolve guards run after page loading; cancelled targets must not pause the current game.
    if (to !== leavingFor) {
      return
    }

    leavingFor = null
    departureTarget = to
    departing.value = true
    const saved = await game.prepareLeave()
    if (departureTarget !== to || !saved) {
      return false
    }
  })

  const finishDeparture = (to: RouteLocationNormalized) => {
    // An older cancellation must retain the snapshot while a newer destination loads.
    // Query updates may keep this GameView mounted, so success must also release its presentation.
    if (to === leavingFor || (to === departureTarget && leavingFor === null)) {
      clearDeparture()
    }
  }

  const removeAfterGuard = router.afterEach(finishDeparture)
  const removeErrorGuard = router.onError((_error, to) => finishDeparture(to))
  onScopeDispose(() => {
    removeLeaveGuard()
    removeAfterGuard()
    removeErrorGuard()
    document.removeEventListener('visibilitychange', hidden)
    window.removeEventListener('pagehide', exiting)
    window.clearInterval(timer)
    window.clearInterval(saveTimer)
    window.clearInterval(leaseTimer)
    void game.leaveGame()
  })

  return { departing }
}
