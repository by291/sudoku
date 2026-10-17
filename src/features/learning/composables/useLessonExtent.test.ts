import { effectScope, nextTick, ref, shallowRef } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { useLessonExtent } from '@/features/learning/composables/useLessonExtent'

const observers = new Set<MeasuredResizeObserver>()

class MeasuredResizeObserver implements ResizeObserver {
  private element: Element | null = null

  constructor(private callback: ResizeObserverCallback) {
    observers.add(this)
  }

  observe(element: Element) {
    this.element = element
  }

  unobserve() {
    this.element = null
  }

  disconnect() {
    this.element = null
    observers.delete(this)
  }

  measure(width: number, height: number) {
    if (!this.element) {
      return
    }
    const size = { inlineSize: width, blockSize: height }
    this.callback(
      [
        {
          target: this.element,
          contentRect: new DOMRectReadOnly(0, 0, width, height),
          borderBoxSize: [size],
          contentBoxSize: [size],
          devicePixelContentBoxSize: [size],
        },
      ],
      this,
    )
  }
}

afterEach(() => {
  observers.clear()
  vi.unstubAllGlobals()
})

it('retains the tallest visited lesson mode until the lesson or available width changes', async () => {
  vi.stubGlobal('ResizeObserver', MeasuredResizeObserver)
  const scope = effectScope()
  const element = shallowRef<HTMLElement | null>(null)
  const lessonId = ref('rules')
  const extent = scope.run(() => useLessonExtent(element, lessonId))
  element.value = document.createElement('div')
  await nextTick()
  const resize = (width: number, height: number) => {
    for (const observer of observers) {
      observer.measure(width, height)
    }
  }

  resize(360, 1200)
  resize(360, 900)

  expect(extent?.value).toEqual({ minHeight: '1200px' })
  resize(720, 600)
  expect(extent?.value).toEqual({ minHeight: '600px' })

  lessonId.value = 'naked-single'
  await nextTick()
  expect(extent?.value).toBeUndefined()
  resize(720, 400)
  expect(extent?.value).toEqual({ minHeight: '400px' })

  scope.stop()
  resize(720, 1500)
  expect(extent?.value).toEqual({ minHeight: '400px' })
})
