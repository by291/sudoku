<script setup lang="ts">
import { ref, watch } from 'vue'
import { NConfigProvider, zhCN, dateZhCN } from 'naive-ui'
import { useTheme } from '@/theme/useTheme'
import EngineLoadingState from '@/shared/components/EngineLoadingState.vue'

const props = defineProps<{ failed: boolean }>()
defineEmits<{ retry: [] }>()

const { theme, themeOverrides } = useTheme()
const LOADING_INDICATOR_DELAY_MS = 200
const showLoading = ref(false)

watch(
  () => props.failed,
  (failed, _previous, onCleanup) => {
    showLoading.value = false
    if (failed) {
      return
    }

    // Fast initialization should reach the page without flashing a temporary loading card.
    const timer = window.setTimeout(() => {
      showLoading.value = true
    }, LOADING_INDICATOR_DELAY_MS)
    onCleanup(() => window.clearTimeout(timer))
  },
  { immediate: true },
)
</script>

<template>
  <NConfigProvider
    :theme="theme"
    :theme-overrides="themeOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <EngineLoadingState v-show="failed || showLoading" :failed="failed" @retry="$emit('retry')" />
  </NConfigProvider>
</template>
