import { computed } from 'vue'
import type { Ref } from 'vue'
import { darkTheme } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'

export function useUiTheme(resolvedTheme: Ref<'light' | 'dark'>) {
  const configuration = computed(() => {
    // Reading the preference here also refreshes CSS overrides on system theme changes.
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
    }
    return { theme, themeOverrides }
  })
  return {
    theme: computed(() => configuration.value.theme),
    themeOverrides: computed(() => configuration.value.themeOverrides),
  }
}
