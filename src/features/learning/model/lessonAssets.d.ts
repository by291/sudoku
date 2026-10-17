declare module 'virtual:sudoku-lessons' {
  export const directory: unknown
  export const lessonLoaders: Readonly<Record<string, () => Promise<{ default: unknown }>>>
}
