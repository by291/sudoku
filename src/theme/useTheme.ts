import { computed, onScopeDispose, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { darkTheme } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'

import type { ThemePreference } from '@/features/settings/model/preferences'

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

  const uiConfiguration = computed(() => {
    // Track the resolved theme so CSS overrides refresh when the system theme changes.
    const theme = resolvedTheme.value === 'dark' ? darkTheme : null
    const styles = getComputedStyle(document.documentElement)
    const color = (name: string) => styles.getPropertyValue(name).trim()

    const themeOverrides: GlobalThemeOverrides = {
      common: {
        primaryColor: color('--accent'),
        primaryColorHover: color('--accent-hover'),
        primaryColorPressed: color('--accent-active'),
        primaryColorSuppl: color('--accent'),
        bodyColor: color('--background'),
        cardColor: color('--surface'),
        modalColor: color('--surface'),
        popoverColor: color('--surface'),
        inputColor: color('--surface'),
        textColorBase: color('--text'),
        textColor1: color('--text'),
        textColor2: color('--text'),
        textColor3: color('--muted'),
        borderColor: color('--control-border'),
        borderRadius: '8px',
        fontFamily: "'Segoe UI', 'Microsoft YaHei', sans-serif",
        heightMedium: '44px',
        heightLarge: '52px',
        fontSize: '14px',
      },
      Button: {
        color: color('--surface'),
        colorHover: color('--accent-soft'),
        colorPressed: color('--accent-soft'),
        textColorPrimary: color('--accent-contrast'),
        textColorHoverPrimary: color('--accent-contrast'),
        textColorPressedPrimary: color('--accent-contrast'),
        textColorFocusPrimary: color('--accent-contrast'),
        // Info buttons share the secondary resume palette without changing informational alerts.
        colorInfo: color('--resume'),
        colorHoverInfo: color('--resume-hover'),
        colorPressedInfo: color('--resume-active'),
        colorFocusInfo: color('--resume-hover'),
        colorDisabledInfo: color('--resume'),
        textColorInfo: color('--resume-contrast'),
        textColorHoverInfo: color('--resume-contrast'),
        textColorPressedInfo: color('--resume-contrast'),
        textColorFocusInfo: color('--resume-contrast'),
        textColorDisabledInfo: color('--resume-contrast'),
        borderInfo: `1px solid ${color('--resume')}`,
        borderHoverInfo: `1px solid ${color('--resume-hover')}`,
        borderPressedInfo: `1px solid ${color('--resume-active')}`,
        borderFocusInfo: `1px solid ${color('--resume-hover')}`,
        borderDisabledInfo: `1px solid ${color('--resume')}`,
        rippleColorInfo: color('--resume-contrast'),
      },
      Alert: {
        colorError: color('--error-soft'),
        borderError: `1px solid ${color('--error')}`,
        contentTextColorError: color('--error'),
      },
      Card: {
        borderColor: color('--border'),
        paddingSmall: '12px',
      },
      Radio: {
        buttonColorActive: color('--accent'),
        buttonTextColorActive: color('--accent-contrast'),
        buttonBorderColorActive: color('--accent'),
      },
    }

    return { theme, themeOverrides }
  })

  return {
    preference,
    resolvedTheme,
    setTheme,
    theme: computed(() => uiConfiguration.value.theme),
    themeOverrides: computed(() => uiConfiguration.value.themeOverrides),
  }
}
