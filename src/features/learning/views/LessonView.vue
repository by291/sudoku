<script setup lang="ts">
import { NAlert, NButton, NCard } from 'naive-ui'
import type { CardProps } from 'naive-ui'
import { computed, onMounted, onScopeDispose, ref, useId, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import type { Digit } from '@/core/sudoku/types'
import { isDigit } from '@/core/sudoku/types'
import { isKeyboardOwnedByControl } from '@/shared/utils/keyboardOwnership'
import NumberPad from '@/shared/components/NumberPad.vue'
import { maskOf } from '@/core/sudoku/board'
import SudokuBoard from '@/shared/components/SudokuBoard.vue'
import GameView from '@/features/game/views/GameView.vue'
import { LESSONS } from '@/features/learning/model/lessons'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
const route = useRoute(),
  learning = useLearningStore()
const lesson = computed(() => LESSONS.find((lesson) => lesson.id === route.params.lessonId))
const practice = computed(() => route.query.practice === '1')
const explanationId = useId()
const selected = ref<number | null>(null)
const removals = ref<{ cell: number; digit: Digit }[]>([])
const feedback = ref<string | null>(null)
const correct = ref(false),
  busy = ref(false),
  showExplanation = ref(false)
const feedbackTheme = computed<CardProps['themeOverrides']>(() =>
  correct.value
    ? undefined
    : {
        color: 'var(--error-soft)',
        borderColor: 'var(--error)',
        textColor: 'var(--error)',
      },
)
const exerciseCells = computed(() =>
  !lesson.value
    ? []
    : lesson.value.exercise.kind === 'placement'
      ? [lesson.value.exercise.expected.cell]
      : [...new Set(lesson.value.exercise.expected.map((pair) => pair.cell))],
)
const exercisePrompt = computed(() =>
  lesson.value?.exercise.kind === 'placement'
    ? '点击圆点标出的空格，填写应该出现的数字。'
    : '点击圆点标出的格子，选择可以排除的候选数。再次选择可撤回，然后提交全部排除。',
)
const selectionText = computed(() =>
  selected.value === null
    ? '先选择一个练习格'
    : `已选第${Math.floor(selected.value / 9) + 1}行第${(selected.value % 9) + 1}列`,
)
const exampleNotes = computed(
  () =>
    lesson.value?.candidates.map((mask, cell) =>
      removals.value
        .filter((pair) => pair.cell === cell)
        .reduce((remaining, pair) => remaining & ~maskOf(pair.digit), mask),
    ) ?? [],
)
watch(
  () => lesson.value?.id,
  async (id) => {
    selected.value = null
    removals.value = []
    feedback.value = null
    correct.value = false
    showExplanation.value = false
    await learning.load()
    if (id) learning.selectLesson(id)
  },
  { immediate: true },
)
async function answer(digit: Digit) {
  if (!lesson.value || selected.value === null || busy.value) return
  if (lesson.value.exercise.kind === 'elimination') {
    if (!(lesson.value.candidates[selected.value] & maskOf(digit))) return
    const pair = { cell: selected.value, digit }
    const exists = removals.value.some(
      (item) => item.cell === pair.cell && item.digit === pair.digit,
    )
    removals.value = exists
      ? removals.value.filter((item) => item.cell !== pair.cell || item.digit !== pair.digit)
      : [...removals.value, pair]
  } else {
    busy.value = true
    const result = await learning.submitExercise(lesson.value.id, { cell: selected.value, digit })
    feedback.value = result.explanation
    correct.value = result.correct
    busy.value = false
  }
}
async function submitEliminations() {
  if (!lesson.value || busy.value) return
  busy.value = true
  const result = await learning.submitExercise(lesson.value.id, removals.value)
  feedback.value = result.explanation
  correct.value = result.correct
  busy.value = false
}
function resetExercise() {
  removals.value = []
  feedback.value = null
}
function handleExerciseKey(event: KeyboardEvent) {
  if (
    practice.value ||
    !lesson.value ||
    selected.value === null ||
    busy.value ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    isKeyboardOwnedByControl(event)
  )
    return
  const digit = Number(event.key)
  if (event.key.length !== 1 || !isDigit(digit)) return
  event.preventDefault()
  void answer(digit)
}
onMounted(() => window.addEventListener('keydown', handleExerciseKey))
onScopeDispose(() => window.removeEventListener('keydown', handleExerciseKey))
</script>
<template>
  <section v-if="!lesson" class="panel unknown">
    <h1>找不到这节课程</h1>
    <RouterLink v-slot="{ href, navigate }" to="/learn" custom>
      <NButton tag="a" type="primary" :href="href" @click="navigate">返回学习列表</NButton>
    </RouterLink>
  </section>
  <GameView
    v-else-if="practice"
    :key="lesson.id"
    :metadata="{ kind: 'learning', lessonId: lesson.id }"
    :heading="`${lesson.title} · 实战练习`"
    :practice-difficulty="lesson.practiceDifficulty"
    :practice-variant="lesson.practiceVariant"
  />
  <section v-else class="lesson-page">
    <header class="lesson-heading">
      <h1>{{ lesson.title }}</h1>
      <p class="muted exercise-caption">
        {{
          lesson.exercise.kind === 'placement'
            ? '填写圆点标出的空格，找出正确数字。'
            : '选出圆点位置可排除的候选数，再提交。'
        }}
      </p>
    </header>
    <NAlert v-if="learning.error" class="feedback-message" type="error" :show-icon="false">
      {{ learning.error }}
    </NAlert>
    <div class="lesson-layout">
      <div class="lesson-board">
        <SudokuBoard
          :board="lesson.board"
          :givens="lesson.board"
          :notes="exampleNotes"
          :rules="lesson.rules"
          :related-cells="[]"
          :selected-cell="selected"
          :conflicts="[]"
          :hint-cells="exerciseCells"
          :disabled="false"
          :obscured="false"
          @select="selected = $event"
        />
        <div class="exercise-toolbar" role="group" aria-label="练习操作">
          <template v-if="lesson.exercise.kind === 'elimination'">
            <NButton type="primary" :disabled="busy" @click="submitEliminations">提交排除</NButton>
            <NButton :disabled="busy" @click="resetExercise">重置练习</NButton>
          </template>
          <NButton
            :aria-expanded="showExplanation"
            :aria-controls="explanationId"
            @click="showExplanation = !showExplanation"
          >
            {{ showExplanation ? '收起讲解' : '查看讲解' }}
          </NButton>
        </div>
        <NumberPad
          class="exercise-pad"
          layout="row"
          :disabled="selected === null || busy"
          :action-label="lesson.exercise.kind === 'placement' ? '填写' : '排除'"
          @digit="answer"
        />
        <div class="exercise-status muted">
          <span>{{ selectionText }}</span>
          <span class="keyboard-guide">键盘 1–9 · 方向键移动</span>
        </div>
        <NCard
          v-if="feedback"
          class="feedback-message"
          size="small"
          role="status"
          :theme-overrides="feedbackTheme"
        >
          {{ feedback }}
        </NCard>
        <p class="muted small">固定教学片段 · 候选数已包含前面推理的排除结果</p>
      </div>
      <aside class="panel lesson-guide" aria-label="练习指引">
        <p class="exercise-kind">
          {{ lesson.exercise.kind === 'placement' ? '填写练习' : '候选数排除' }}
        </p>
        <h2>试着推理一次</h2>
        <p class="introduction">{{ lesson.introduction }}</p>
        <p>{{ exercisePrompt }}</p>
        <template v-if="lesson.exercise.kind === 'elimination'">
          <p class="muted">已选择 {{ removals.length }} 个排除项</p>
          <ul v-if="removals.length" class="removal-list">
            <li v-for="pair in removals" :key="`${pair.cell}:${pair.digit}`">
              第{{ Math.floor(pair.cell / 9) + 1 }}行第{{ (pair.cell % 9) + 1 }}列：排除
              {{ pair.digit }}
            </li>
          </ul>
        </template>
        <div v-show="showExplanation" :id="explanationId" class="explanation">
          <h3>这一步，怎么想</h3>
          <p>{{ lesson.explanation }}</p>
        </div>
        <div class="practice-entry">
          <h3>把方法用起来</h3>
          <p>进入一盘完整数独，试着独立运用这节课的方法。</p>
          <RouterLink v-slot="{ href, navigate }" :to="`/learn/${lesson.id}?practice=1`" custom>
            <NButton tag="a" type="primary" size="large" block :href="href" @click="navigate">
              进入完整棋盘练习 <span aria-hidden="true" class="forward-arrow">→</span>
            </NButton>
          </RouterLink>
        </div>
      </aside>
    </div>
  </section>
</template>
<style scoped>
.lesson-page,
.unknown {
  margin-top: 24px;
}
h1 {
  font-size: 30px;
  margin: 0 0 8px;
}
.introduction {
  max-width: 800px;
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}
.exercise-caption {
  margin: 0;
  font-size: 14px;
}
.lesson-layout {
  display: grid;
  grid-template-columns: minmax(0, clamp(320px, calc(100dvh - 360px), 560px)) minmax(280px, 1fr);
  align-items: start;
  gap: 28px;
  margin-top: 20px;
}
.lesson-board {
  min-width: 0;
}
h2 {
  margin: 0 0 12px;
  font-size: 20px;
}
.exercise-pad {
  display: none;
  margin: 12px 0;
}
.exercise-toolbar {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.exercise-toolbar > button {
  flex: 1;
  min-width: 0;
  padding: 0 12px;
}
.exercise-status {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  font-size: 12px;
}
.exercise-kind {
  margin: 0 0 8px;
  color: var(--accent);
  font-size: 12px;
  letter-spacing: 1px;
}
.explanation {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.practice-entry {
  margin-top: 24px;
  padding: 18px;
  background: var(--accent-soft);
  border-radius: 12px;
}
h3 {
  font-size: 16px;
  margin: 0 0 8px;
}
.practice-entry p {
  font-size: 13px;
  margin: 0 0 16px;
}
.forward-arrow {
  margin-left: 12px;
}
.small,
.removal-list {
  font-size: 12px;
}
.removal-list {
  padding-left: 20px;
}
@media (max-width: 800px) {
  .lesson-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }
  .lesson-board {
    width: 100%;
    max-width: 560px;
    justify-self: center;
  }
  .lesson-guide {
    padding: 16px;
  }
  h1 {
    font-size: 25px;
  }
}
@media (max-width: 800px), (pointer: coarse) {
  .exercise-pad {
    display: grid;
  }
  .keyboard-guide {
    display: none;
  }
}
</style>
