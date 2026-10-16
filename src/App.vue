<script setup lang="ts">
import { onMounted, onScopeDispose, ref, shallowRef } from 'vue'
import ReadyApplication from '@/ReadyApplication.vue'
import EngineBootstrapState from '@/EngineBootstrapState.vue'
import { createGameRuntime } from '@/runtime'
import type { GameRuntime } from '@/runtime'
import { loadSudokuModule } from '@/sudoku/wasmModule'
import { createMainEngine } from '@/sudoku/mainEngine'
import type { MainSudokuEngine } from '@/sudoku/mainEngine'

const props = defineProps<{ installRuntime(runtime: GameRuntime): void }>()

const phase = ref<'loading' | 'failed' | 'ready'>('loading')
const runtime = shallowRef<GameRuntime | null>(null)
const application = ref<InstanceType<typeof ReadyApplication> | null>(null)
let generation = 0
let disposed = false

async function start() {
  if (disposed || runtime.value) {
    return
  }
  const current = ++generation
  phase.value = 'loading'
  let engine: MainSudokuEngine | null = null
  let preparedRuntime: GameRuntime | null = null

  try {
    const module = await loadSudokuModule()
    if (disposed || current !== generation) {
      return
    }
    engine = await createMainEngine(module)
    // A late initializer must release its memory instead of publishing a stale runtime.
    if (disposed || current !== generation) {
      engine.dispose()
      return
    }

    preparedRuntime = createGameRuntime(engine)
    engine = null
    // Pinia runs store setup in the application context, so publish there before mounting stores.
    props.installRuntime(preparedRuntime)
    runtime.value = preparedRuntime
    preparedRuntime = null
    phase.value = 'ready'
  } catch (error: unknown) {
    console.error('Sudoku engine initialization failed', error)
    engine?.dispose()
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
  <EngineBootstrapState v-else :failed="phase === 'failed'" @retry="start" />
</template>
