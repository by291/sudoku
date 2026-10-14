<script setup lang="ts">
import { NAlert, NButton, NCard } from 'naive-ui'
import type { CardProps } from 'naive-ui'
import { computed, useId, useTemplateRef, nextTick } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import NumberPad from '@/shared/components/NumberPad.vue'
import SudokuBoard from '@/shared/components/SudokuBoard.vue'
import GameView from '@/features/game/views/GameView.vue'
import { LESSONS } from '@/features/learning/model/lessons'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
import { useLessonExercise } from '@/features/learning/composables/useLessonExercise'
import { explainStepEvidence } from '@/core/sudoku/techniques'

const route = useRoute()
const learning = useLearningStore()
const lesson = computed(() => LESSONS.find((lesson) => lesson.id === route.params.lessonId))
const practice = computed(() => route.query.practice === '1')
const explanationId = useId()
const boardRegion = useTemplateRef<HTMLElement>('boardRegion')
const {
  selected,
  removals,
  feedback,
  correct,
  busy,
  showExplanation,
  exerciseCells,
  exercisePrompt,
  selectionText,
  exampleNotes,
  answer,
  submitEliminations,
  resetExercise,
  stageLesson,
  stageCaption,
  canAdvance,
  completed,
  nextStage,
} = useLessonExercise(lesson, practice)
const evidenceDetails = computed(() =>
  stageLesson.value ? explainStepEvidence(stageLesson.value.step) : [],
)

async function advanceStage() {
  nextStage()
  await nextTick()
  const target = exerciseCells.value[0]
  boardRegion.value?.querySelectorAll('button')[target]?.focus()
}

const feedbackTheme = computed<CardProps['themeOverrides']>(() =>
  correct.value
    ? undefined
    : {
        color: 'var(--error-soft)',
        borderColor: 'var(--error)',
        textColor: 'var(--error)',
      },
)
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
  <section v-else-if="stageLesson" class="lesson-page">
    <header class="lesson-heading">
      <h1>{{ lesson.title }}</h1>
      <p class="muted exercise-caption">
        {{
          stageLesson.exercise.kind === 'placement'
            ? '填写圆点标出的空格，找出正确数字。'
            : '选出圆点位置可排除的候选数，再提交。'
        }}
      </p>
    </header>
    <NAlert v-if="learning.error" class="feedback-message" type="error" :show-icon="false">
      {{ learning.error }}
    </NAlert>
    <div class="lesson-layout">
      <div ref="boardRegion" class="lesson-board">
        <SudokuBoard
          :board="stageLesson.board"
          :givens="stageLesson.board"
          :notes="exampleNotes"
          :rules="stageLesson.rules"
          :related-cells="[]"
          :selected-cell="selected"
          :conflicts="[]"
          :hint-cells="exerciseCells"
          :disabled="false"
          :obscured="false"
          @select="selected = $event"
        />
        <div class="exercise-toolbar" role="group" aria-label="练习操作">
          <template v-if="stageLesson.exercise.kind === 'elimination'">
            <NButton
              type="primary"
              :disabled="busy || canAdvance || completed"
              @click="submitEliminations"
              >提交排除</NButton
            >
            <NButton :disabled="busy || canAdvance || completed" @click="resetExercise"
              >重置练习</NButton
            >
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
          :disabled="selected === null || busy || canAdvance || completed"
          :action-label="stageLesson.exercise.kind === 'placement' ? '填写' : '排除'"
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
        <p class="muted">{{ stageCaption }}</p>
        <p v-if="busy" class="muted">正在准备或保存练习，请稍候…</p>
        <NButton v-if="canAdvance" type="primary" size="large" @click="advanceStage"
          >下一阶段</NButton
        >
        <p v-if="completed">本课全部练习已完成，进度已保存。</p>
        <p class="muted small">固定教学片段 · 候选数已包含前面推理的排除结果</p>
      </div>
      <aside class="panel lesson-guide" aria-label="练习指引">
        <p class="exercise-kind">
          {{ stageLesson.exercise.kind === 'placement' ? '填写练习' : '候选数排除' }}
        </p>
        <h2>试着推理一次</h2>
        <p class="introduction">{{ lesson.introduction }}</p>
        <p>{{ exercisePrompt }}</p>
        <template v-if="stageLesson.exercise.kind === 'elimination'">
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
          <p>{{ stageLesson.explanation }}</p>
          <ul v-if="evidenceDetails.length" class="evidence-details">
            <li v-for="detail in evidenceDetails" :key="detail">{{ detail }}</li>
          </ul>
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
