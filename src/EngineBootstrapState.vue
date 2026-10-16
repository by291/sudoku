<script setup lang="ts">
import { NConfigProvider, zhCN, dateZhCN } from 'naive-ui'
import { useTheme } from '@/theme/useTheme'
import EngineLoadingState from '@/shared/components/EngineLoadingState.vue'

defineProps<{ failed: boolean }>()
defineEmits<{ retry: [] }>()

const { theme, themeOverrides } = useTheme()
</script>

<template>
  <NConfigProvider
    :theme="theme"
    :theme-overrides="themeOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <EngineLoadingState :failed="failed" @retry="$emit('retry')" />
  </NConfigProvider>
</template>
