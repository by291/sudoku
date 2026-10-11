import { onScopeDispose, ref, watch } from 'vue'
import type { Ref } from 'vue'

export type ThemePreference = 'light' | 'dark' | 'system'

export function useTheme(preference: Ref<ThemePreference> = ref('system')) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const resolvedTheme = ref<'light' | 'dark'>('light')
  function applyTheme() {
    resolvedTheme.value =
      preference.value === 'system' ? (media.matches ? 'dark' : 'light') : preference.value
    document.documentElement.dataset.theme = resolvedTheme.value
  }
  function setTheme(value: ThemePreference) {
    preference.value = value
  }
  media.addEventListener('change', applyTheme)
  watch(preference, applyTheme, { immediate: true, flush: 'sync' })
  onScopeDispose(() => media.removeEventListener('change', applyTheme))
  return { preference, resolvedTheme, setTheme }
}
