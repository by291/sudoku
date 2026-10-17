<script setup lang="ts">
import { NAlert, NButton, NProgress } from 'naive-ui'
import { computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import { lessonStages } from '@/features/learning/model/lessons'
import { useDelayedProgress } from '@/shared/composables/useDelayedProgress'
import {
  parseVariantQuery,
  getVariantPresentation,
  VARIANT_OPTIONS,
} from '@/features/game/model/variants'

const route = useRoute()
const learning = useLearningStore()
const showLoading = useDelayedProgress(() => learning.loading)
const LESSONS = learning.lessons
const preferences = usePreferencesStore()
const variantQuery = computed(() => parseVariantQuery(route.query.variant))
const selectedVariant = computed(() =>
  variantQuery.value.valid ? variantQuery.value.value : 'classic',
)
const completedLessonIds = computed(() => new Set(learning.progress.map((item) => item.lessonId)))
const totalCompleted = computed(
  () => LESSONS.filter((lesson) => completedLessonIds.value.has(lesson.id)).length,
)
const courseChoices = computed(() =>
  VARIANT_OPTIONS.map((variant) => {
    const lessons = LESSONS.filter((lesson) => lesson.practiceVariant === variant.value)

    return {
      ...variant,
      total: lessons.length,
      completed: lessons.filter((lesson) => completedLessonIds.value.has(lesson.id)).length,
    }
  }),
)
const selectedLessons = computed(() =>
  LESSONS.filter((lesson) => lesson.practiceVariant === selectedVariant.value),
)
const completedCount = computed(
  () => selectedLessons.value.filter((lesson) => completedLessonIds.value.has(lesson.id)).length,
)
const progressText = computed(
  () => `已完成 ${completedCount.value} / ${selectedLessons.value.length} 节`,
)
const progressPercentage = computed(() =>
  selectedLessons.value.length ? (completedCount.value / selectedLessons.value.length) * 100 : 0,
)
const suggestedLesson = computed(() => {
  const unfinished = selectedLessons.value.filter(
    (lesson) => !completedLessonIds.value.has(lesson.id),
  )

  return (
    unfinished.find((lesson) => lesson.id === preferences.settings.currentLessonId) ??
    unfinished[0] ??
    selectedLessons.value[0]
  )
})
const suggestionLabel = computed(() => {
  if (suggestedLesson.value && completedLessonIds.value.has(suggestedLesson.value.id)) {
    return '复习课程'
  }

  if (suggestedLesson.value?.id === preferences.settings.currentLessonId) {
    return '继续学习'
  }

  return completedCount.value ? '学习下一节' : '开始学习'
})
const suggestionCaption = computed(() => {
  if (suggestionLabel.value === '复习课程') {
    return '全部学完了，再巩固一次'
  }

  if (suggestionLabel.value === '继续学习') {
    return '接着上次的思路'
  }

  return completedCount.value ? '下一步，试试这节课' : '推荐从这里开始'
})
const suggestionStage = computed(() => {
  const lesson = suggestedLesson.value
  if (!lesson || completedLessonIds.value.has(lesson.id)) {
    return ''
  }

  const total = lessonStages(lesson).length
  return `第 ${Math.min(learning.exerciseStage(lesson.id) + 1, total)} / ${total} 阶段`
})
function lessonStatus(id: string, suggested: boolean): string {
  if (completedLessonIds.value.has(id)) {
    return '已完成'
  }
  if (id === preferences.settings.currentLessonId || learning.exerciseStage(id) > 0) {
    return '学习中'
  }

  return suggested ? '推荐学习' : '可学习'
}
const classicStages: Readonly<Record<string, string>> = {
  rules: '起步 · 认识棋盘',
  'naked-single': '基础 · 寻找唯一',
  'locked-candidate': '进阶 · 排除候选',
  'naked-triple': '高级 · 专家推理',
}
const lessonSteps = computed(() =>
  selectedLessons.value.map((lesson, index) => ({
    lesson,
    number: String(index + 1).padStart(2, '0'),
    stage:
      selectedVariant.value === 'classic'
        ? classicStages[lesson.id]
        : index === 0
          ? '入门 · 理解玩法'
          : index === 3
            ? '综合 · 连续推理'
            : '进阶 · 候选与约束',
    completed: completedLessonIds.value.has(lesson.id),
    suggested: lesson.id === suggestedLesson.value?.id,
  })),
)

onMounted(learning.load)
</script>

<template>
  <section class="learning-page" :aria-busy="learning.loading">
    <header class="learning-heading">
      <p class="eyebrow">循序渐进 / LEARN</p>
      <h1>从看懂一格，到解开整盘</h1>
      <p class="muted learning-introduction">选一种玩法，沿着推理的路径，慢慢练熟。</p>
      <p v-if="totalCompleted > 0 && totalCompleted < LESSONS.length" class="muted">
        课程已扩充至 32 节；之前的完成记录保留，新加入的课程可继续学习。
      </p>
    </header>
    <p v-if="showLoading" class="muted" role="status">正在读取学习进度，请稍候…</p>
    <NAlert v-if="learning.error" class="feedback-message" type="error" :show-icon="false">
      {{ learning.error }} <NButton @click="learning.load">重试</NButton>
    </NAlert>
    <NAlert v-if="!variantQuery.valid" class="feedback-message" type="warning" :show-icon="false">
      无法识别这个课程玩法，请重新选择。
      <RouterLink v-slot="{ href, navigate }" to="/learn" custom>
        <NButton tag="a" :href="href" @click="navigate">查看标准课程</NButton>
      </RouterLink>
    </NAlert>
    <div class="learning-workspace">
      <aside class="course-sidebar">
        <h2 class="sidebar-heading">选择玩法</h2>
        <nav class="course-navigation" aria-label="学习玩法">
          <RouterLink
            v-for="choice in courseChoices"
            :key="choice.value"
            v-slot="{ href, navigate }"
            :to="{ path: '/learn', query: { variant: choice.value } }"
            custom
          >
            <NButton
              tag="a"
              :href="href"
              :aria-current="selectedVariant === choice.value ? 'page' : undefined"
              :type="selectedVariant === choice.value ? 'primary' : 'default'"
              :quaternary="selectedVariant !== choice.value"
              class="course-choice"
              @click="navigate"
            >
              <span class="choice-name">{{ choice.label }}</span>
              <span class="choice-progress">{{ choice.completed }} / {{ choice.total }}</span>
            </NButton>
          </RouterLink>
        </nav>
        <div class="total-progress">
          <p>我的学习进度</p>
          <NProgress
            type="line"
            :percentage="(totalCompleted / LESSONS.length) * 100"
            :show-indicator="false"
            :height="5"
            color="var(--accent)"
            rail-color="var(--border)"
            aria-label="全部课程学习进度"
            :aria-valuetext="`已完成 ${totalCompleted} / ${LESSONS.length} 节`"
          />
          <span class="muted">已完成 {{ totalCompleted }} / {{ LESSONS.length }} 节</span>
        </div>
      </aside>
      <section class="course-content" :aria-label="getVariantPresentation(selectedVariant).label">
        <div class="course-overview">
          <div class="overview-copy">
            <p class="eyebrow">{{ selectedVariant === 'classic' ? '逻辑基础' : '变体入门' }}</p>
            <h2>{{ getVariantPresentation(selectedVariant).label }}</h2>
            <p class="course-description">{{ getVariantPresentation(selectedVariant).ruleText }}</p>
          </div>
          <div v-if="suggestedLesson" class="course-action">
            <div class="suggestion-copy">
              <p class="suggestion-caption">
                {{ suggestionCaption }} · {{ suggestedLesson.title }}
              </p>
              <p v-if="suggestionStage" class="suggestion-stage">{{ suggestionStage }}</p>
            </div>
            <RouterLink v-slot="{ href, navigate }" :to="`/learn/${suggestedLesson.id}`" custom>
              <NButton
                tag="a"
                :type="suggestionLabel === '继续学习' ? 'info' : 'primary'"
                :href="href"
                @click="navigate"
              >
                {{ suggestionLabel }} <span class="forward-arrow" aria-hidden="true">→</span>
              </NButton>
            </RouterLink>
          </div>
          <div class="course-progress">
            <NProgress
              type="circle"
              style="width: 100%"
              :percentage="progressPercentage"
              :stroke-width="5"
              color="var(--accent)"
              rail-color="var(--border)"
              :aria-label="`${getVariantPresentation(selectedVariant).label}学习进度`"
              :aria-valuetext="progressText"
            >
              <span class="progress-count">
                {{ completedCount
                }}<span class="progress-total"> / {{ selectedLessons.length }}</span>
              </span>
            </NProgress>
            <p>课程已完成</p>
          </div>
        </div>
        <div class="path-heading">
          <h2>课程路径</h2>
          <span class="muted">{{ selectedLessons.length }} 节互动课程 · 随时可以重学</span>
        </div>
        <ol class="lesson-path" aria-label="课程路径">
          <li v-for="step in lessonSteps" :key="step.lesson.id" class="lesson-step">
            <RouterLink
              :to="`/learn/${step.lesson.id}`"
              class="lesson-link"
              :class="{ 'suggested-lesson': step.suggested, 'completed-lesson': step.completed }"
            >
              <span class="step-number" aria-hidden="true">{{ step.number }}</span>
              <div class="step-copy">
                <div class="step-heading">
                  <h3>{{ step.lesson.title }}</h3>
                  <span v-if="step.stage" class="stage-label">{{ step.stage }}</span>
                </div>
                <p>{{ step.lesson.introduction }}</p>
              </div>
              <span class="step-status">
                {{ lessonStatus(step.lesson.id, step.suggested) }}
                <span class="step-arrow" aria-hidden="true">↗</span>
              </span>
            </RouterLink>
          </li>
        </ol>
        <p class="learning-note">读懂讲解 · 完成互动练习 · 进入完整棋盘，把方法用起来。</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.learning-page {
  padding-top: var(--page-top-space);
}
.learning-heading {
  margin-bottom: var(--page-heading-space);
}
h1 {
  margin: 8px 0 12px;
  font-size: 30px;
}
.eyebrow {
  margin: 0 0 8px;
  color: var(--accent);
  font-size: 12px;
  letter-spacing: 2px;
}
.learning-workspace {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  align-items: start;
  gap: 32px;
}
.course-sidebar {
  position: sticky;
  top: 24px;
  padding: 20px 12px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
}
.sidebar-heading {
  margin: 0 12px 16px;
  font-size: 16px;
}
.course-navigation {
  display: grid;
  gap: 8px;
}
.course-choice {
  height: auto;
  min-height: 52px;
  padding: 12px;
  border-radius: 10px;
}
.course-choice :deep(.n-button__content) {
  width: 100%;
  justify-content: space-between;
  gap: 12px;
}
.course-choice[aria-current='page'] .choice-name {
  font-weight: 700;
}
.choice-progress {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.total-progress {
  margin: 20px 12px 0;
  padding-top: 20px;
  border-top: 1px solid var(--border);
  font-size: 12px;
}
.total-progress p {
  margin: 0 0 12px;
  font-size: 13px;
}
.total-progress > span {
  display: block;
  margin-top: 8px;
}
.course-content {
  min-width: 0;
}
.course-overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px;
  grid-template-areas: 'copy progress' 'action action';
  align-items: center;
  gap: 20px 24px;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--accent-soft);
}
.overview-copy {
  grid-area: copy;
}
.overview-copy h2 {
  margin: 0;
  font-size: 28px;
}
.course-description {
  margin: 12px 0 0;
  font-size: 14px;
}
.suggestion-caption {
  margin: 0;
  font-size: 13px;
}
.suggestion-stage {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.forward-arrow {
  margin-left: 20px;
}
.course-action {
  grid-area: action;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.course-progress {
  grid-area: progress;
  text-align: center;
}
.progress-count {
  color: var(--text);
  font-size: 32px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.progress-total {
  color: var(--muted);
  font-size: 15px;
}
.course-progress p {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.path-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin: 28px 0 16px;
}
.path-heading h2 {
  margin: 0;
  font-size: 18px;
}
.path-heading > span {
  font-size: 12px;
}
.lesson-path {
  list-style: none;
  padding: 0;
  margin: 0;
}
.lesson-step {
  position: relative;
  padding-bottom: 12px;
}
.lesson-step:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 36px;
  bottom: -40px;
  left: 36px;
  border-left: 1px solid var(--control-border);
}
.stage-label {
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.lesson-link {
  position: relative;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: start;
  gap: 16px;
  padding: 20px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  transition:
    border-color 0.15s,
    background-color 0.15s;
}
.lesson-link:hover {
  border-color: var(--accent);
  background: var(--peer);
}
.suggested-lesson {
  border-color: var(--accent);
}
.step-number {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--background);
  color: var(--muted);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.suggested-lesson .step-number {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}
.completed-lesson .step-number {
  background: var(--accent-soft);
  color: var(--accent);
}
.step-copy h3 {
  margin: 2px 0 8px;
  font-size: 17px;
}
.step-heading {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0 16px;
}
.step-copy p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  text-wrap: pretty;
}
.step-status {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
  color: var(--accent);
  font-size: 12px;
  white-space: nowrap;
}
.step-arrow {
  font-size: 18px;
}
.learning-note {
  margin: 16px 0 0;
  color: var(--muted);
  font-size: 13px;
}
@media (min-width: 801px) and (max-height: 1000px) {
  .learning-heading {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px 24px;
    margin-bottom: 24px;
  }
  h1 {
    margin: 0;
    font-size: 28px;
  }
  .learning-heading > p {
    margin: 0;
  }
  .learning-heading > .eyebrow {
    flex-basis: 100%;
  }
  .eyebrow {
    margin-bottom: 4px;
  }
  .learning-workspace {
    gap: 24px;
  }
  .course-sidebar {
    top: 16px;
  }
  .total-progress {
    margin-top: 12px;
    padding-top: 12px;
  }
  .overview-copy h2 {
    font-size: 24px;
  }
  .progress-count {
    font-size: 24px;
  }
  .progress-total {
    font-size: 12px;
  }
  .course-progress p {
    margin-top: 6px;
  }
  .path-heading {
    margin: 24px 0 16px;
  }
}
@media (min-width: 1100px) {
  .course-overview {
    grid-template-columns: minmax(0, 1fr) auto 96px;
    grid-template-areas: 'copy action progress';
  }
  .course-action {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    max-width: 190px;
    gap: 12px;
  }
}
@media (max-width: 800px) {
  .learning-workspace {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }
  .course-sidebar {
    position: static;
    padding: 16px;
  }
  .sidebar-heading {
    margin-left: 0;
  }
  .course-navigation {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .course-choice {
    padding: 12px 10px;
  }
  .total-progress {
    margin: 16px 0 0;
    padding-top: 16px;
  }
}
@media (max-width: 600px) {
  h1 {
    font-size: 25px;
  }
  .course-navigation {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .course-choice :deep(.n-button__content) {
    gap: 8px;
  }
  .course-overview {
    grid-template-columns: minmax(0, 1fr) 72px;
    align-items: start;
    gap: 12px;
    padding: 20px;
  }
  .overview-copy {
    display: block;
  }
  .overview-copy h2 {
    font-size: 24px;
  }
  .course-action {
    display: block;
  }
  .suggestion-caption {
    margin-bottom: 12px;
  }
  .course-description {
    margin-top: 8px;
  }
  .progress-count {
    font-size: 24px;
  }
  .progress-total {
    font-size: 12px;
  }
  .course-progress p {
    display: none;
  }
  .lesson-link {
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 12px;
  }
  .step-number {
    width: 32px;
    height: 32px;
    font-size: 13px;
  }
  .lesson-step:not(:last-child)::before {
    left: 32px;
  }
  .step-status {
    grid-column: 2;
    margin: 0;
    justify-content: space-between;
  }
}
</style>
