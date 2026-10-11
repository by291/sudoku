<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { useTheme } from './theme'
import type { ThemePreference } from './theme'
import { computed, onMounted, onScopeDispose } from 'vue'
import { usePreferencesStore } from './usePreferencesStore'
import { useRecordsStore } from '../features/records/useRecordsStore'
import { useGameStore } from '../features/game/useGameStore'
import { useGameRuntime } from './runtime'

const preferences = usePreferencesStore(),
  records = useRecordsStore(),
  game = useGameStore(),
  runtime = useGameRuntime()
const chosenTheme = computed({
  get: () => preferences.settings.theme,
  set: (theme: ThemePreference) => {
    void preferences.update({ theme })
  },
})
const { preference, setTheme } = useTheme(chosenTheme)
onMounted(preferences.load)
onScopeDispose(() => {
  records.dispose()
  game.dispose()
  void game.leaveGame().then(() => runtime.dispose?.())
})
const themes: { value: ThemePreference; label: string; name: string }[] = [
  { value: 'light', label: '浅色主题', name: '浅色' },
  { value: 'dark', label: '深色主题', name: '深色' },
  { value: 'system', label: '跟随系统主题', name: '系统' },
]
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <RouterLink class="brand" to="/" aria-label="一格一念，返回首页">
        <span class="brand-mark" aria-hidden="true">▦</span>
        <span>一格一念<span class="brand-subtitle">数独 · SUDOKU</span></span>
      </RouterLink>
      <div class="theme-switch" role="group" aria-label="界面主题">
        <button
          v-for="theme in themes"
          :key="theme.value"
          :aria-label="theme.label"
          :aria-pressed="preference === theme.value"
          @click="setTheme(theme.value)"
        >
          {{ theme.name }}
        </button>
      </div>
    </header>
    <p v-if="preferences.error" class="notice error" role="alert">
      {{ preferences.error }} <button @click="preferences.update({})">重试保存设置</button>
    </p>
    <main aria-label="数独游戏"><RouterView /></main>
    <footer class="site-footer">在九宫格里，留一点专注的时间。</footer>
  </div>
</template>

<style scoped>
.app-shell {
  max-width: 1160px;
  margin: auto;
  padding: 0 24px;
}
.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 28px 0;
  border-bottom: 1px solid var(--border);
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text);
  text-decoration: none;
  font-size: 22px;
  font-weight: 700;
}
.brand-mark {
  color: var(--accent);
  font-size: 40px;
}
.brand-subtitle {
  display: block;
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--muted);
  margin-top: 3px;
  font-weight: 400;
}
.theme-switch {
  display: flex;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 3px;
}
.theme-switch button {
  border: 0;
  padding: 8px 10px;
  min-height: 36px;
  font-size: 12px;
  background: transparent;
}
.theme-switch button[aria-pressed='true'] {
  background: var(--accent-soft);
  color: var(--accent);
}
.site-footer {
  margin: 56px 0 24px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}
@media (max-width: 600px) {
  .app-shell {
    padding: 0 16px;
  }
  .site-header {
    padding: 18px 0;
  }
  .brand {
    font-size: 18px;
    gap: 6px;
  }
  .theme-switch button {
    padding: 8px;
  }
}
</style>
