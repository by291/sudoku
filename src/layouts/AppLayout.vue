<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { useTemplateRef } from 'vue'
import { NAlert, NButton, NRadioButton, NRadioGroup } from 'naive-ui'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import type { ThemePreference } from '@/features/settings/model/preferences'

defineProps<{ preference: ThemePreference }>()
const emit = defineEmits<{ theme: [preference: ThemePreference] }>()
const preferences = usePreferencesStore()

const mainContent = useTemplateRef<HTMLElement>('mainContent')
function focusMain() {
  // The router owns the URL hash; a skip link must only move focus and scroll.
  mainContent.value?.focus()
  mainContent.value?.scrollIntoView()
}
function updateTheme(value: string | number | boolean) {
  if (value === 'light' || value === 'dark' || value === 'system') emit('theme', value)
}

const themes: { value: ThemePreference; label: string; name: string }[] = [
  { value: 'light', label: '浅色主题', name: '浅色' },
  { value: 'dark', label: '深色主题', name: '深色' },
  { value: 'system', label: '跟随系统主题', name: '系统' },
]
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content" @click.prevent="focusMain">跳到主要内容</a>
    <header class="site-header">
      <RouterLink class="brand" to="/" aria-label="一格一念，返回首页">
        <span class="brand-mark" aria-hidden="true">▦</span>
        <span>一格一念<span class="brand-subtitle">数独 · SUDOKU</span></span>
      </RouterLink>
      <NRadioGroup
        class="theme-switch"
        :value="preference"
        name="interface-theme"
        role="radiogroup"
        aria-label="界面主题"
        @update:value="updateTheme"
      >
        <NRadioButton
          v-for="choice in themes"
          :key="choice.value"
          :aria-label="choice.label"
          :value="choice.value"
        >
          {{ choice.name }}
        </NRadioButton>
      </NRadioGroup>
    </header>
    <NAlert v-if="preferences.error" class="feedback-message" type="error" :show-icon="false">
      {{ preferences.error }} <NButton @click="preferences.update({})">重试保存设置</NButton>
    </NAlert>
    <main id="main-content" ref="mainContent" tabindex="-1" aria-label="数独游戏">
      <RouterView />
    </main>
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
  padding: 20px 0;
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
}
.theme-switch :deep(.n-radio-button) {
  min-height: 44px;
  padding: 0 12px;
}
.theme-switch :deep(.n-radio-button:focus-within) {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
  z-index: 1;
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
    padding: 12px 0;
  }
  .brand {
    font-size: 18px;
    gap: 6px;
  }
  .theme-switch :deep(.n-radio-button) {
    padding: 0 9px;
  }
}
</style>
