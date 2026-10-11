<script setup lang="ts">
import { NAlert, NButton, NCard } from 'naive-ui'
import type { CardProps } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import type { Digit } from '../../core/sudoku/types'
import NumberPad from '../../components/NumberPad.vue'
import { maskOf } from '../../core/sudoku/board'
import SudokuBoard from '../game/SudokuBoard.vue'
import GamePage from '../game/GamePage.vue'
import { LESSONS } from './lessons'
import { useLearningStore } from './useLearningStore'
const route = useRoute(),
  learning = useLearningStore()
const lesson = computed(() => LESSONS.find((lesson) => lesson.id === route.params.lessonId))
const practice = computed(() => route.query.practice === '1')
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
</script>
<template>
  <section v-if="!lesson" class="panel unknown">
    <h1>找不到这节课程</h1>
    <RouterLink to="/learn">返回学习列表</RouterLink>
  </section>
  <GamePage
    v-else-if="practice"
    :key="lesson.id"
    :metadata="{ kind: 'learning', lessonId: lesson.id }"
    :heading="`${lesson.title} · 实战练习`"
    :practice-difficulty="lesson.practiceDifficulty"
    ><RouterLink :to="`/learn/${lesson.id}`">返回本节课程</RouterLink></GamePage
  >
  <section v-else class="lesson-page">
    <RouterLink to="/learn">← 学习列表</RouterLink>
    <h1>{{ lesson.title }}</h1>
    <p class="introduction">{{ lesson.introduction }}</p>
    <NAlert v-if="learning.error" class="feedback-message" type="error" :show-icon="false">
      {{ learning.error }}
    </NAlert>
    <div class="lesson-layout">
      <div>
        <SudokuBoard
          :board="lesson.board"
          :givens="lesson.board"
          :notes="exampleNotes"
          :selected-cell="selected"
          :conflicts="[]"
          :hint-cells="exerciseCells"
          :disabled="false"
          :obscured="false"
          @select="selected = $event"
        />
        <p class="muted small">这是固定教学片段；候选数已包含前面推理的排除结果。</p>
      </div>
      <div class="panel">
        <h2>试着推理一次</h2>
        <p>
          {{
            lesson.exercise.kind === 'placement'
              ? '点击圆点标出的空格，选择应该填写的数字。'
              : '点击圆点标出的格子，选择可以排除的候选数。可再次点击撤回，然后提交全部排除。'
          }}
        </p>
        <p v-if="selected !== null" class="muted">
          已选：第{{ Math.floor(selected / 9) + 1 }}行第{{ (selected % 9) + 1 }}列
        </p>
        <NumberPad
          class="exercise-pad"
          :disabled="selected === null || busy"
          :action-label="lesson.exercise.kind === 'placement' ? '填写' : '排除'"
          @digit="answer"
        />
        <template v-if="lesson.exercise.kind === 'elimination'"
          ><p>已选择 {{ removals.length }} 个排除项</p>
          <ul v-if="removals.length" class="removal-list">
            <li v-for="pair in removals" :key="`${pair.cell}:${pair.digit}`">
              第{{ Math.floor(pair.cell / 9) + 1 }}行第{{ (pair.cell % 9) + 1 }}列：排除
              {{ pair.digit }}
            </li>
          </ul>
          <NButton type="primary" :disabled="busy" @click="submitEliminations">提交排除</NButton
          ><NButton @click="resetExercise">重置练习</NButton></template
        >
        <NCard
          v-if="feedback"
          class="feedback-message"
          size="small"
          role="status"
          :theme-overrides="feedbackTheme"
        >
          {{ feedback }}
        </NCard>
        <NButton @click="showExplanation = !showExplanation">
          {{ showExplanation ? '收起讲解' : '查看讲解' }}
        </NButton>
        <p v-if="showExplanation">{{ lesson.explanation }}</p>
        <div class="practice-link">
          <RouterLink :to="`/learn/${lesson.id}?practice=1`">进入完整棋盘练习 →</RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>
<style scoped>
.lesson-page,
.unknown {
  margin-top: 32px;
}
h1 {
  font-size: 30px;
}
.introduction {
  max-width: 740px;
  color: var(--muted);
}
.lesson-layout {
  display: grid;
  grid-template-columns: minmax(0, 550px) minmax(0, 1fr);
  gap: 28px;
  margin-top: 26px;
}
h2 {
  margin-top: 0;
  font-size: 20px;
}
.exercise-pad {
  margin: 20px 0;
}
.practice-link {
  border-top: 1px solid var(--border);
  padding-top: 22px;
  margin-top: 22px;
}
.small,
.removal-list {
  font-size: 12px;
}
.removal-list {
  padding-left: 20px;
}
@media (max-width: 700px) {
  .lesson-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .panel {
    padding: 16px;
  }
}
</style>
