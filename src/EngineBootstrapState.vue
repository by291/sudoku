<script setup lang="ts">
import { NConfigProvider, zhCN, dateZhCN } from 'naive-ui'
import { useTheme } from '@/theme/useTheme'
import EngineLoadingState from '@/shared/components/EngineLoadingState.vue'
import { useDelayedProgress } from '@/shared/composables/useDelayedProgress'

const props = defineProps<{ failed: boolean }>()
defineEmits<{ retry: [] }>()

const { theme, themeOverrides } = useTheme()
const showLoading = useDelayedProgress(() => !props.failed)
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
