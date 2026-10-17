<script setup lang="ts">
import { NConfigProvider, zhCN, dateZhCN } from 'naive-ui'
import { useTheme } from '@/theme/useTheme'
import ApplicationLoadingState from '@/shared/components/ApplicationLoadingState.vue'
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
    <ApplicationLoadingState
      v-show="failed || showLoading"
      :failed="failed"
      @retry="$emit('retry')"
    />
  </NConfigProvider>
</template>
