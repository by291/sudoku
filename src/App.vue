<script setup lang="ts">
import { computed, onMounted, onScopeDispose } from 'vue'
import { NConfigProvider, zhCN, dateZhCN } from 'naive-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import { useTheme } from '@/theme/useTheme'
import type { ThemePreference } from '@/features/settings/model/preferences'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import { useRecordsStore } from '@/features/records/stores/useRecordsStore'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { useGameRuntime } from '@/runtime'

const preferences = usePreferencesStore()
const records = useRecordsStore()
const game = useGameStore()
const runtime = useGameRuntime()

const chosenTheme = computed({
  get: () => preferences.settings.theme,
  set: (theme: ThemePreference) => {
    void preferences.update({ theme })
  },
})
const { preference, setTheme, theme, themeOverrides } = useTheme(chosenTheme)

onMounted(preferences.load)
onScopeDispose(() => {
  records.dispose()
  game.dispose()
  void game.leaveGame().then(() => runtime.dispose?.())
})
</script>

<template>
  <NConfigProvider
    :theme="theme"
    :theme-overrides="themeOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <AppLayout :preference="preference" @theme="setTheme" />
  </NConfigProvider>
</template>
