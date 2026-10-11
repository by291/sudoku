import { onScopeDispose, ref, watch } from 'vue'
import type { Ref } from 'vue'

export type ThemePreference = 'light' | 'dark' | 'system'

export function useTheme(preference: Ref<ThemePreference> = ref('system')) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  function applyTheme() {
    document.documentElement.dataset.theme =
      preference.value === 'system' ? (media.matches ? 'dark' : 'light') : preference.value
  }
  function setTheme(value: ThemePreference) {
    preference.value = value
  }
  media.addEventListener('change', applyTheme)
  watch(preference, applyTheme, { immediate: true, flush: 'sync' })
  onScopeDispose(() => media.removeEventListener('change', applyTheme))
  return { preference, setTheme }
}
