import { readonly, ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

const PROGRESS_DELAY_MS = 350

/** Delays presentation only; completion and scope disposal cancel pending feedback immediately. */
export function useDelayedProgress(
  pending: MaybeRefOrGetter<boolean>,
  delayMs = PROGRESS_DELAY_MS,
) {
  const visible = ref(false)

  watch(
    () => toValue(pending),
    (active, _previous, onCleanup) => {
      visible.value = false
      if (!active) {
        return
      }

      const timer = setTimeout(() => {
        visible.value = true
      }, delayMs)
      onCleanup(() => clearTimeout(timer))
    },
    // Observe even a same-tick completion/restart so each operation receives its own delay.
    { immediate: true, flush: 'sync' },
  )

  return readonly(visible)
}
