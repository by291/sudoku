import { onMounted, onScopeDispose } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { LEASE_RENEWAL_MS } from '@/infrastructure/ownership'
import { useGameStore } from '@/features/game/stores/useGameStore'
export function useGameLifecycle() {
  const game = useGameStore()
  const hidden = () => {
    if (document.hidden) void game.leaveGame()
  }
  const exiting = () => {
    void game.leaveGame()
  }
  let timer = 0,
    saveTimer = 0,
    leaseTimer = 0
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
  onBeforeRouteLeave(async () => {
    await game.leaveGame()
  })
  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', hidden)
    window.removeEventListener('pagehide', exiting)
    window.clearInterval(timer)
    window.clearInterval(saveTimer)
    window.clearInterval(leaseTimer)
    void game.leaveGame()
  })
}
