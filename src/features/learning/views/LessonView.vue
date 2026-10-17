<script setup lang="ts">
import { NAlert, NButton, NCard, NRadioButton, NRadioGroup } from 'naive-ui'
import type { CardProps } from 'naive-ui'
import { computed, ref, useTemplateRef, nextTick, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import NumberPad from '@/shared/components/NumberPad.vue'
import SudokuBoard from '@/shared/components/SudokuBoard.vue'
import GameView from '@/features/game/views/GameView.vue'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
import { useLessonExercise } from '@/features/learning/composables/useLessonExercise'
import { explainStep, explainStepEvidence } from '@/features/game/model/techniquePresentation'
import { useDelayedProgress } from '@/shared/composables/useDelayedProgress'
import { useLessonExtent } from '@/features/learning/composables/useLessonExtent'

const route = useRoute()
const router = useRouter()
const learning = useLearningStore()
const lesson = computed(() =>
  learning.lessons.find((lesson) => lesson.id === route.params.lessonId),
)
const practice = computed(() => route.query.practice === '1')
const boardRegion = useTemplateRef<HTMLElement>('boardRegion')
const lessonLayout = useTemplateRef<HTMLElement>('lessonLayout')
const lessonExtent = useLessonExtent(lessonLayout, () => lesson.value?.id)
const {
  selected,
  placement,
  removals,
  mode,
  selectMode,
  feedback,
  correct,
  busy,
  exerciseCells,
  exercisePrompt,
  selectionText,
  exampleNotes,
  exerciseBoard,
  canSubmit,
  answer,
  submitAnswer,
  resetExercise,
  stageLesson,
  stageCaption,
  canAdvance,
  completed,
  nextStage,
} = useLessonExercise(lesson, practice)
const showBusy = useDelayedProgress(busy)
const guidedSelection = ref<number | null>(null)
watch(
  () => lesson.value?.id,
  () => {
    guidedSelection.value = null
  },
)

const inGuide = computed(() => mode.value === 'guide')
const displayedStage = computed(() => (inGuide.value ? lesson.value?.guided : stageLesson.value))
const displayedBoard = computed(() =>
  inGuide.value ? (lesson.value?.guided.board ?? []) : exerciseBoard.value,
)
const displayedNotes = computed(() =>
  inGuide.value ? (lesson.value?.guided.candidates ?? []) : exampleNotes.value,
)
const displayedSelection = computed(() => (inGuide.value ? guidedSelection.value : selected.value))
// Authored proof cells are an answer reveal; exercises expose them only after a correct submission.
const evidenceVisible = computed(() => inGuide.value || correct.value)
const highlightedCells = computed(() =>
  evidenceVisible.value ? (displayedStage.value?.step.evidence.cells ?? []) : exerciseCells.value,
)
const evidenceDetails = computed(() =>
  displayedStage.value ? explainStepEvidence(displayedStage.value.step) : [],
)
const explanation = computed(() =>
  displayedStage.value ? explainStep(displayedStage.value.step) : '',
)
const exerciseKind = computed(() => {
  if (inGuide.value) {
    return '跟着示例看思路'
  }

  return stageLesson.value?.exercise.kind === 'placement' ? '填写练习' : '候选数排除'
})
const feedbackSummary = computed(() => {
  if (!correct.value) {
    return feedback.value
  }
  if (completed.value) {
    return '推理正确！本课全部练习已完成，进度已保存。'
  }
  return canAdvance.value
    ? '推理正确！准备好后进入下一阶段。'
    : '推理正确，但进度尚未保存。请再次提交以重试。'
})
const feedbackTheme = computed<CardProps['themeOverrides']>(() =>
  correct.value
    ? undefined
    : { color: 'var(--error-soft)', borderColor: 'var(--error)', textColor: 'var(--error)' },
)
const primaryActionLabel = computed(() => {
  if (inGuide.value) {
    return '开始练习'
  }
  if (canAdvance.value) {
    return '下一阶段'
  }
  if (completed.value) {
    return '进入完整棋盘练习'
  }

  return stageLesson.value?.exercise.kind === 'placement' ? '提交答案' : '提交排除'
})
const primaryActionDisabled = computed(
  () =>
    !inGuide.value && (busy.value || (!canAdvance.value && !completed.value && !canSubmit.value)),
)

async function runPrimaryAction() {
  if (inGuide.value) {
    selectMode('exercise')
  } else if (canAdvance.value) {
    await advanceStage()
  } else if (completed.value && lesson.value) {
    await router.push(`/learn/${lesson.value.id}?practice=1`)
  } else {
    await submitAnswer()
  }
}

function selectCell(cell: number) {
  if (inGuide.value) {
    guidedSelection.value = cell
  } else {
    selected.value = cell
  }
}

async function advanceStage() {
  nextStage()
  await nextTick()
  const target = exerciseCells.value[0]
  boardRegion.value?.querySelectorAll('button')[target]?.focus()
}
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
  <section v-else-if="stageLesson && displayedStage" class="lesson-page" :aria-busy="busy">
    <header class="lesson-heading">
      <h1>{{ lesson.title }}</h1>
      <NRadioGroup
        name="lesson-mode"
        role="radiogroup"
        aria-label="课程模式"
        :value="mode"
        size="large"
        @update:value="selectMode"
      >
        <NRadioButton value="guide">学习讲解</NRadioButton>
        <NRadioButton value="exercise">动手练习</NRadioButton>
      </NRadioGroup>
    </header>
    <NAlert v-if="learning.error" class="feedback-message" type="error" :show-icon="false">
      {{ learning.error }}
      <NButton
        v-if="learning.readyGeneration !== learning.datasetGeneration"
        :disabled="learning.loading"
        @click="learning.load"
        >重试</NButton
      >
    </NAlert>

    <div class="lesson-workspace" :style="lessonExtent">
      <div ref="lessonLayout" class="lesson-layout">
        <div ref="boardRegion" class="lesson-board">
          <SudokuBoard
            :board="displayedBoard"
            :givens="displayedStage.board"
            :notes="displayedNotes"
            :rules="displayedStage.rules"
            :related-cells="[]"
            :selected-cell="displayedSelection"
            :conflicts="[]"
            :hint-cells="highlightedCells"
            :disabled="false"
            :obscured="false"
            :show-selected-rules="false"
            @select="selectCell"
          />
          <div class="exercise-toolbar" role="group" aria-label="练习操作">
            <NButton
              type="primary"
              :aria-label="primaryActionLabel"
              :disabled="primaryActionDisabled"
              :loading="!inGuide && showBusy"
              @click="runPrimaryAction"
            >
              {{ primaryActionLabel }}
            </NButton>
            <NButton
              :class="{ 'concealed-control': inGuide }"
              :disabled="busy || canAdvance || completed || (!placement && !removals.length)"
              @click="resetExercise"
              >清空选择</NButton
            >
          </div>
          <NumberPad
            class="exercise-pad"
            :class="{ 'concealed-control': inGuide }"
            layout="row"
            :disabled="inGuide || selected === null || busy || canAdvance || completed"
            :action-label="stageLesson.exercise.kind === 'placement' ? '填写' : '排除'"
            @digit="answer"
          />
          <div class="exercise-status muted">
            <span>{{ inGuide ? '圆点标出这一步的推理依据' : selectionText }}</span>
            <span v-if="!inGuide" class="keyboard-guide">键盘 1–9 · 方向键移动</span>
          </div>
          <p class="muted stage-caption">{{ stageCaption }}</p>
          <div class="feedback-slot" aria-live="polite">
            <p v-if="showBusy" class="muted busy-caption">正在准备或保存练习，请稍候…</p>
            <NCard
              v-else-if="!inGuide && feedback"
              class="answer-feedback"
              content-class="answer-feedback-content"
              size="small"
              role="status"
              :theme-overrides="feedbackTheme"
            >
              {{ feedbackSummary }}
            </NCard>
          </div>
        </div>

        <aside class="panel lesson-guide" :aria-label="inGuide ? '学习讲解' : '练习指引'">
          <p class="exercise-kind">{{ exerciseKind }}</p>
          <h2>{{ inGuide ? '这一步，怎么想' : '试着推理一次' }}</h2>
          <p class="introduction">{{ lesson.introduction }}</p>
          <p v-if="!inGuide">{{ exercisePrompt }}</p>
          <p class="muted small">固定教学片段 · 候选数已包含前面推理的排除结果</p>
          <template v-if="!inGuide && stageLesson.exercise.kind === 'elimination'">
            <p class="muted">已选择 {{ removals.length }} 个排除项</p>
            <ul v-if="removals.length" class="removal-list">
              <li v-for="pair in removals" :key="`${pair.cell}:${pair.digit}`">
                第{{ Math.floor(pair.cell / 9) + 1 }}行第{{ (pair.cell % 9) + 1 }}列：排除
                {{ pair.digit }}
              </li>
            </ul>
          </template>
          <div v-if="evidenceVisible" class="explanation">
            <h3 v-if="!inGuide">这一步，怎么想</h3>
            <p>{{ explanation }}</p>
            <ul v-if="evidenceDetails.length" class="evidence-details">
              <li v-for="detail in evidenceDetails" :key="detail">{{ detail }}</li>
            </ul>
          </div>
          <div class="practice-entry">
            <h3>把方法用起来</h3>
            <p>进入一盘完整数独，试着独立运用这节课的方法。</p>
            <RouterLink v-slot="{ href, navigate }" :to="`/learn/${lesson.id}?practice=1`" custom>
              <NButton tag="a" size="large" block :href="href" @click="navigate">
                进入完整棋盘练习 <span aria-hidden="true" class="forward-arrow">→</span>
              </NButton>
            </RouterLink>
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lesson-page,
.unknown {
  margin-top: var(--page-top-space);
}
.lesson-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 20px;
}
h1 {
  font-size: 30px;
  margin: 0;
}
.introduction {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}
.lesson-workspace {
  margin-top: 20px;
  /* The outer extent preserves scroll range; moving inner explanations must not become scroll anchors. */
  overflow-anchor: none;
}
.lesson-layout {
  display: grid;
  grid-template-columns: minmax(0, clamp(320px, calc(100dvh - 380px), 560px)) minmax(280px, 1fr);
  align-items: start;
  gap: 28px;
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
.concealed-control {
  visibility: hidden;
}
.exercise-toolbar {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.exercise-toolbar > :is(button, a) {
  flex: 1;
  min-width: 0;
  min-height: 44px;
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
.stage-caption {
  margin: 8px 0 0;
  font-size: 12px;
}
.feedback-slot {
  min-height: 76px;
  margin-top: 10px;
}
.answer-feedback {
  font-size: 13px;
}
.busy-caption {
  margin: 0;
  font-size: 13px;
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
@media (min-width: 801px) and (max-height: 1000px) {
  h1 {
    font-size: 28px;
  }
  .lesson-layout {
    /* Reserve the same board and action geometry before and after answer feedback. */
    grid-template-columns: minmax(0, clamp(320px, calc(100dvh - 400px), 560px)) minmax(280px, 1fr);
    gap: 24px;
  }
  .lesson-workspace {
    margin-top: 16px;
  }
  .lesson-guide {
    padding: 20px;
  }
  .practice-entry {
    margin-top: 16px;
    padding: 16px;
  }
}
@media (max-width: 800px) {
  .lesson-page {
    margin-top: 0;
    padding-bottom: calc(88px + env(safe-area-inset-bottom));
  }
  .lesson-heading {
    position: sticky;
    z-index: 10;
    top: 0;
    padding: 6px 0;
    background: var(--background);
  }
  .lesson-workspace {
    margin-top: 8px;
  }
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
  .exercise-status {
    margin-top: 8px;
  }
  .feedback-slot {
    margin-top: 6px;
  }
  .answer-feedback :deep(.answer-feedback-content) {
    padding: 8px 12px;
  }
  .exercise-toolbar {
    position: fixed;
    z-index: 20;
    right: 0;
    bottom: 0;
    left: 0;
    margin: 0;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
    background: var(--surface);
  }
  .exercise-toolbar > :is(button, a) {
    min-height: 48px;
  }
  .lesson-page :deep(:focus-visible) {
    scroll-margin-block: 120px calc(88px + env(safe-area-inset-bottom));
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
