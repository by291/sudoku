export const LESSON_IDS = [
  'rules',
  'naked-single',
  'hidden-single',
  'locked-candidate',
  'naked-pair',
  'hidden-pair',
  'diagonal-rules',
  'jigsaw-rules',
  'killer-rules',
  'thermo-rules',
  'arrow-rules',
] as const
export function isLessonId(value: unknown): value is (typeof LESSON_IDS)[number] {
  return LESSON_IDS.some((id) => id === value)
}
