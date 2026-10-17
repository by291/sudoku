<script setup lang="ts">
import { onMounted, onScopeDispose, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import ReadyApplication from '@/ReadyApplication.vue'
import ApplicationBootstrapState from '@/ApplicationBootstrapState.vue'
import { createGameRuntime } from '@/runtime'
import type { GameRuntime } from '@/runtime'

const props = defineProps<{ installRuntime(runtime: GameRuntime): void }>()
const router = useRouter()

const phase = ref<'loading' | 'failed' | 'ready'>('loading')
const runtime = shallowRef<GameRuntime | null>(null)
const application = ref<InstanceType<typeof ReadyApplication> | null>(null)
let generation = 0
let disposed = false

async function prepareInitialNavigation(retry: boolean) {
  if (retry) {
    // A failed initial navigation must be restarted; isReady alone would wait indefinitely.
    await router.replace(router.options.history.location)
  }

  await router.isReady()
}

async function start() {
  if (disposed || runtime.value) {
    return
  }

  const current = ++generation
  const retry = phase.value === 'failed'
  phase.value = 'loading'
  let preparedRuntime: GameRuntime | null = null

  try {
    // Browsing starts with storage services; computation is requested by actual game operations.
    await prepareInitialNavigation(retry)
    // Disposal or a newer retry owns the outcome after navigation completes.
    if (disposed || current !== generation) {
      return
    }

    preparedRuntime = createGameRuntime()

    // Pinia 4.0.3 resolves store injections in the app context; publish before mounting stores.
    props.installRuntime(preparedRuntime)
    runtime.value = preparedRuntime
    preparedRuntime = null
    phase.value = 'ready'
  } catch (error: unknown) {
    console.error('Sudoku application initialization failed', error)
    preparedRuntime?.dispose?.()

    if (!disposed && current === generation) {
      phase.value = 'failed'
    }
  }
}

onMounted(start)
onScopeDispose(() => {
  disposed = true
  generation++

  if (application.value?.shutdown) {
    void application.value.shutdown()
  } else {
    runtime.value?.dispose?.()
  }
})
</script>

<template>
  <ReadyApplication v-if="runtime && phase === 'ready'" ref="application" />
  <ApplicationBootstrapState v-else :failed="phase === 'failed'" @retry="start" />
</template>
