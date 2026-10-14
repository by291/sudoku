export type ThemePreference = 'light' | 'dark' | 'system'

export type Settings = {
  theme: ThemePreference
  showTimer: boolean
  highlightConflicts: boolean
  currentLessonId: string | null
  lessonStages?: Readonly<Record<string, number>>
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  showTimer: true,
  highlightConflicts: true,
  currentLessonId: null,
}
