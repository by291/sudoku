import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'

/** Fit the board to its allocated space after navigation and controls have been laid out. */
export function useBoardSize(space: Readonly<Ref<HTMLElement | null>>) {
  const side = ref<number | null>(null)

  watch(
    space,
    (element, _previous, onCleanup) => {
      side.value = null
      if (!element || typeof ResizeObserver === 'undefined') {
        return
      }

      let frame: number | undefined
      const observer = new ResizeObserver(([entry]) => {
        if (!entry) {
          return
        }

        if (frame !== undefined) {
          cancelAnimationFrame(frame)
        }

        // Applying the width can wrap control text; let that layout settle before observing again.
        frame = requestAnimationFrame(() => {
          side.value = Math.floor(Math.min(entry.contentRect.width, entry.contentRect.height))
        })
      })
      observer.observe(element)

      onCleanup(() => {
        observer.disconnect()
        if (frame !== undefined) {
          cancelAnimationFrame(frame)
        }
      })
    },
    { flush: 'post' },
  )

  return computed(() => (side.value ? { '--board-side': `${side.value}px` } : undefined))
}
