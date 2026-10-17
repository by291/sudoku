<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { computed, ref, useTemplateRef } from 'vue'
import { NAlert, NButton, NRadioButton, NRadioGroup } from 'naive-ui'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import type { ThemePreference } from '@/features/settings/model/preferences'

defineProps<{ preference: ThemePreference }>()
const emit = defineEmits<{ theme: [preference: ThemePreference] }>()
const preferences = usePreferencesStore()
const route = useRoute()
const backTarget = computed(() => {
  if (route.path === '/') {
    return null
  }

  return route.meta.parentNavigation?.(route) ?? { to: '/', label: '返回首页' }
})

const mainContent = useTemplateRef<HTMLElement>('mainContent')

function focusMain() {
  // The router owns the URL hash; a skip link must only move focus and scroll.
  mainContent.value?.focus()
  mainContent.value?.scrollIntoView()
}

// WebKit can drop :focus-visible after native radio arrow navigation.
const themeKeyboardFocus = ref(false)

function updateTheme(value: string | number | boolean) {
  if (value === 'light' || value === 'dark' || value === 'system') {
    emit('theme', value)
  }
}

const themes: { value: ThemePreference; label: string; name: string }[] = [
  { value: 'light', label: '浅色主题', name: '浅色' },
  { value: 'dark', label: '深色主题', name: '深色' },
  { value: 'system', label: '跟随系统主题', name: '系统' },
]
</script>

<template>
  <div class="app-shell" :class="{ 'inner-page': backTarget !== null }">
    <a class="skip-link" href="#main-content" @click.prevent="focusMain">跳到主要内容</a>
    <header class="site-header">
      <RouterLink class="brand" to="/" aria-label="一格一念，返回首页">
        <span class="brand-mark" aria-hidden="true">▦</span>
        <span>一格一念<span class="brand-subtitle">数独 · SUDOKU</span></span>
      </RouterLink>
      <NRadioGroup
        class="theme-switch"
        :class="{ 'keyboard-focus': themeKeyboardFocus }"
        :value="preference"
        :theme-overrides="{ buttonBoxShadowFocus: 'none' }"
        name="interface-theme"
        role="radiogroup"
        aria-label="界面主题"
        @keydown="themeKeyboardFocus = true"
        @pointerdown="themeKeyboardFocus = false"
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
      {{ preferences.error }}
      <NButton @click="preferences.retry">{{
        preferences.needsReload ? '重新读取设置' : '重试保存设置'
      }}</NButton>
    </NAlert>
    <main id="main-content" ref="mainContent" tabindex="-1" aria-label="数独游戏">
      <nav v-if="backTarget" class="page-navigation" aria-label="页面导航">
        <RouterLink v-slot="{ href, navigate }" :to="backTarget.to" custom>
          <NButton tag="a" :href="href" @click="navigate">
            <svg class="back-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="m10 5-7 7 7 7M3 12h18"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            {{ backTarget.label }}
          </NButton>
        </RouterLink>
      </nav>
      <RouterView />
    </main>
    <footer class="site-footer">在九宫格里，留一点专注的时间。</footer>
  </div>
</template>

<style scoped>
.app-shell {
  --page-top-space: 24px;
  --page-heading-space: 32px;

  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  max-width: 1160px;
  margin: auto;
  padding: 0 24px;
}
main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.page-navigation {
  padding-top: 24px;
}
.back-icon {
  width: 18px;
  height: 18px;
  margin-right: 8px;
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
  min-height: 44px;
  gap: 12px;
  color: var(--text);
  text-decoration: none;
  font-size: 22px;
  line-height: 1.2;
  font-weight: 700;
}
.brand-mark {
  color: var(--accent);
  font-size: 40px;
  line-height: 1;
}
.brand-subtitle {
  display: block;
  font-size: 10px;
  line-height: 1.6;
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
/* Naive UI 2.45.3 focuses the hidden input; draw one keyboard-only ring on its label. */
.theme-switch :deep(.n-radio-button:has(:focus-visible)),
.theme-switch.keyboard-focus :deep(.n-radio-button:focus-within) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  z-index: 1;
}
.site-footer {
  padding: 32px 0 24px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}
/* Keep short desktop windows useful without changing touch layouts or browser zoom. */
@media (min-width: 801px) and (max-height: 1000px) {
  .inner-page {
    --page-top-space: 12px;
    --page-heading-space: 16px;
  }
  .site-header {
    padding: 12px 0;
  }
  .inner-page .page-navigation {
    padding-top: 12px;
  }
  .inner-page .site-footer {
    padding: 20px 0;
  }
}
/* A board workspace can claim the remaining viewport; recovery and small screens keep normal flow. */
@media (min-width: 801px) and (min-height: 720px) and (pointer: fine) {
  .app-shell:has([data-viewport-fit]) {
    height: 100dvh;
  }
  .app-shell:has([data-viewport-fit]) main {
    min-height: 0;
  }
  .app-shell:has([data-viewport-fit]) .site-footer {
    display: none;
  }
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
    padding: 0 8px;
  }
  .page-navigation {
    padding-top: 16px;
  }
}
</style>
