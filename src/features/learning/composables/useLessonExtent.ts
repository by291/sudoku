import { computed, ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'

export function useLessonExtent(
  content: Readonly<Ref<HTMLElement | null>>,
  lessonId: MaybeRefOrGetter<string | undefined>,
) {
  const minimumHeight = ref(0)

  watch(
    [content, () => toValue(lessonId)],
    ([element], _previous, onCleanup) => {
      minimumHeight.value = 0
      if (!element || typeof ResizeObserver === 'undefined') {
        return
      }

      let previousWidth: number | null = null
      const observer = new ResizeObserver(([entry]) => {
        if (!entry) {
          return
        }
        const { width, height } = entry.contentRect
        // Measure the natural child, then reserve space on its parent. Observing the
        // reserved parent instead would keep an obsolete height after a width change.
        minimumHeight.value =
          width === previousWidth ? Math.max(minimumHeight.value, height) : height
        previousWidth = width
      })
      observer.observe(element)
      onCleanup(() => observer.disconnect())
    },
    { flush: 'post' },
  )

  return computed(() =>
    minimumHeight.value ? { minHeight: `${minimumHeight.value}px` } : undefined,
  )
}
