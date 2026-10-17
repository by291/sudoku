<script setup lang="ts">
import { computed, nextTick, onMounted, onScopeDispose, ref, useTemplateRef } from 'vue'
import { RouterLink, useRouter, type UseLinkReturn } from 'vue-router'
import { NAlert, NButton, NCard } from 'naive-ui'
import ResponsiveDialog from '@/shared/components/ResponsiveDialog.vue'
import { useDelayedProgress } from '@/shared/composables/useDelayedProgress'
import { useRecordsStore } from '@/features/records/stores/useRecordsStore'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import {
  sessionLink,
  modeName,
  sortSavedSessions,
  summarizeSave,
} from '@/features/records/model/records'
import { DIFFICULTY_NAMES, formatDuration } from '@/features/game/model/presentation'
import { getVariantPresentation } from '@/features/game/model/variants'
import { getDailyStatuses } from '@/features/game/model/daily'
import type { SudokuVariant } from '@/sudoku/contracts'
import type { Difficulty } from '@/sudoku/contracts'
import GameSetupDialog from '@/features/game/components/GameSetupDialog.vue'

const router = useRouter()
const records = useRecordsStore()
const showLoading = useDelayedProgress(() => records.busy)
const preferences = usePreferencesStore()
const unfinished = computed(() =>
  sortSavedSessions(records.sessions.filter((record) => !record.session.completion)),
)
const resumeChoices = computed(() =>
  unfinished.value.map(({ session }) => ({ session, summary: summarizeSave(session) })),
)
const dailyStatuses = computed(() =>
  getDailyStatuses(records.sessions, records.results, records.today),
)
const completedDailyCount = computed(
  () => dailyStatuses.value.filter((status) => status.state === 'completed').length,
)
const recordsDescription = computed(() =>
  records.results.length
    ? `已完成 ${records.results.length} 局，回顾用时、成绩与每日挑战。`
    : '完成第一局，留下属于你的数独足迹。',
)
const setupMode = ref<'free' | 'daily' | null>(null)
const variant = ref<SudokuVariant>('classic')
const difficulty = ref<Difficulty>('easy')
const selectedSave = computed(
  () =>
    unfinished.value.find(
      ({ session }) => session.mode === 'free' && session.puzzle.rules.kind === variant.value,
    )?.session ?? null,
)
const resumeOpen = ref(false)
const resumeButton = useTemplateRef<InstanceType<typeof NButton>>('resumeButton')
let openingSetup = false
let disposed = false

async function openSetup(mode: 'free' | 'daily', event: MouseEvent) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
    return
  }

  event.preventDefault()
  if (openingSetup || records.busy) {
    return
  }

  const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  trigger?.focus()

  openingSetup = true
  try {
    await records.load()
    await nextTick()
    // Leaving Home or a newer refresh must not publish a dialog from an outdated read.
    if (disposed || records.busy) {
      return
    }

    // Loading temporarily disables the opener; restore it before the dialog captures focus.
    trigger?.focus()
    setupMode.value = mode
  } finally {
    openingSetup = false
  }
}

onScopeDispose(() => {
  disposed = true
})

function startSelected() {
  const mode = setupMode.value
  if (!mode) {
    return
  }

  setupMode.value = null
  void router.push({
    path: `/play/${mode}`,
    query: {
      variant: variant.value,
      ...(mode === 'free' ? { difficulty: difficulty.value } : {}),
      start: '1',
    },
  })
}

function resumeSelected() {
  if (!selectedSave.value) {
    return
  }

  setupMode.value = null
  void router.push(sessionLink(selectedSave.value))
}

function continueLast(event: MouseEvent) {
  if (records.busy) {
    return
  }

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.focus()
  }

  if (unfinished.value.length === 1) {
    const record = unfinished.value[0]
    if (record) {
      void router.push(sessionLink(record.session))
    }
  } else if (!unfinished.value.length && preferences.settings.currentLessonId) {
    void router.push(`/learn/${preferences.settings.currentLessonId}`)
  } else {
    resumeOpen.value = true
  }
}

function restoreResumeFocus() {
  const element: unknown = resumeButton.value?.$el
  if (element instanceof HTMLElement) {
    element.focus()
  }
}

function continueRecentLesson(event: MouseEvent, navigate: UseLinkReturn['navigate']) {
  void navigate(event)
  resumeOpen.value = false
}

onMounted(records.load)
</script>
<template>
  <div class="home-page">
    <ResponsiveDialog
      v-model:show="resumeOpen"
      title="继续上次"
      class="resume-dialog"
      @after-leave="restoreResumeFocus"
    >
      <div class="resume-content">
        <p class="resume-intro muted">选择一局继续，按开始时间从新到旧排列。</p>
        <ul class="resume-list" aria-label="未完成的存档">
          <li v-for="{ session, summary } in resumeChoices" :key="session.id">
            <RouterLink :to="sessionLink(session)" class="resume-card" @click="resumeOpen = false">
              <div class="resume-details">
                <strong class="resume-title">
                  {{ getVariantPresentation(session.puzzle.rules.kind).label }}
                  <span class="resume-difficulty">{{
                    DIFFICULTY_NAMES[session.puzzle.difficulty]
                  }}</span>
                </strong>
                <p class="resume-source">{{ modeName(session) }}</p>
                <p class="resume-progress">
                  <span>{{ summary.progressLabel }}</span>
                  <span>已用时 {{ formatDuration(session.elapsedMs) }}</span>
                </p>
                <p class="resume-start muted">
                  开始于 <time :datetime="session.startedAt">{{ summary.startedAtLabel }}</time>
                </p>
              </div>
              <span class="resume-action">继续 <span aria-hidden="true">→</span></span>
            </RouterLink>
          </li>
        </ul>

        <RouterLink
          v-if="preferences.settings.currentLessonId"
          v-slot="{ href, navigate }"
          :to="`/learn/${preferences.settings.currentLessonId}`"
          custom
        >
          <NButton
            tag="a"
            type="info"
            size="large"
            :href="href"
            @click="continueRecentLesson($event, navigate)"
            >继续最近的课程 →</NButton
          ></RouterLink
        >
      </div>
    </ResponsiveDialog>
    <section class="home-intro">
      <div>
        <p class="eyebrow">一点逻辑 · 一点耐心</p>
        <h1>一格一念，<br />慢慢解开。</h1>
        <p class="intro-copy">
          让数字各归其位，让思绪安静片刻。<br />从轻松一局开始，发现每一步的道理。
        </p>
        <div class="hero-actions">
          <NButton
            type="primary"
            size="large"
            :disabled="records.busy"
            @click="openSetup('free', $event)"
            >开始一局数独 <span aria-hidden="true" class="action-arrow">↗</span></NButton
          >
          <NButton
            v-if="unfinished.length || preferences.settings.currentLessonId"
            ref="resumeButton"
            type="info"
            size="large"
            :disabled="records.busy"
            @click="continueLast"
            >继续上次</NButton
          >
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div
          v-for="cell in 81"
          :key="cell"
          :class="{ 'art-accent': [6, 14, 22, 31, 40, 49, 58, 66, 74].includes(cell) }"
        >
          {{ cell % 5 === 0 ? (cell % 9) + 1 : '' }}
        </div>
      </div>
    </section>
    <div class="mode-grid">
      <RouterLink v-slot="{ href }" to="/play/free" custom>
        <a :href="href" class="panel mode-card" @click="openSetup('free', $event)"
          ><span class="mode-icon">▦</span>
          <p class="mode-kicker">按自己的节奏</p>
          <h2>自由游玩 <span>↗</span></h2>
          <p>六种玩法，三个难度，随时暂停。把每一道题，慢慢想明白。</p></a
        ></RouterLink
      >
      <RouterLink to="/learn" class="panel mode-card"
        ><span class="mode-icon">✎</span>
        <p class="mode-kicker">让每一步有理由</p>
        <h2>学习数独 <span>↗</span></h2>
        <p>从标准技巧到五种变体规则，跟着小课练习推理。</p></RouterLink
      ><RouterLink v-slot="{ href }" to="/play/daily" custom>
        <a :href="href" class="panel mode-card" @click="openSetup('daily', $event)"
          ><span class="mode-icon">◷</span>
          <p class="mode-kicker">每天，一次小挑战</p>
          <h2>每日挑战 <span>↗</span></h2>
          <p>{{ records.today }} · 已完成 {{ completedDailyCount }} / 6 种玩法</p></a
        ></RouterLink
      ><RouterLink to="/records" class="panel mode-card"
        ><span class="mode-icon" aria-hidden="true">▤</span>
        <p class="mode-kicker">每一局，都有收获</p>
        <h2>数独足迹 <span aria-hidden="true">↗</span></h2>
        <p>{{ recordsDescription }}</p></RouterLink
      >
    </div>
    <NAlert v-if="records.error" class="feedback-message" type="error" :show-icon="false">
      {{ records.error }} <NButton @click="records.load">重试读取</NButton>
    </NAlert>
    <p v-if="showLoading" role="status" class="muted">正在读取存档…</p>
    <NCard v-if="records.quarantined" class="feedback-message" size="small" role="status">
      <div class="quarantine-message">
        <span>有 {{ records.quarantined }} 条记录已隔离。</span>
        <RouterLink v-slot="{ href, navigate }" to="/records" custom>
          <NButton tag="a" type="primary" size="large" :href="href" @click="navigate"
            >查看并清理</NButton
          >
        </RouterLink>
      </div>
    </NCard>
    <GameSetupDialog
      v-if="setupMode"
      v-model:variant="variant"
      v-model:difficulty="difficulty"
      :mode="setupMode"
      :saved-session="selectedSave"
      :statuses="dailyStatuses"
      :busy="records.busy"
      :error="records.error"
      @cancel="setupMode = null"
      @start="startSelected"
      @resume="resumeSelected"
    />
  </div>
</template>
<style scoped>
.home-intro {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  align-items: center;
  gap: 50px;
  padding: 32px 0 80px;
  flex: none;
}
.home-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}
.action-arrow {
  margin-left: 24px;
}
.eyebrow {
  margin: 0;
  color: var(--accent);
  font-size: 13px;
  letter-spacing: 3px;
}
h1 {
  font-size: clamp(38px, 6vw, 64px);
  line-height: 1.3;
  letter-spacing: -2px;
  margin: 18px 0;
}
.intro-copy {
  margin: 0;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.9;
}
.hero-art {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  aspect-ratio: 1;
  max-width: 350px;
  width: 100%;
  margin: auto;
  transform: rotate(-6deg);
  border: 2px solid var(--accent);
  background: var(--surface);
  box-shadow: var(--shadow);
  border-radius: 8px;
  overflow: hidden;
}
.hero-art div {
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  display: grid;
  place-items: center;
  color: var(--accent);
  font-size: 19px;
}
.hero-art div:nth-child(3n) {
  border-right-color: var(--accent);
}
.hero-art div:nth-child(n + 19):nth-child(-n + 27),
.hero-art div:nth-child(n + 46):nth-child(-n + 54) {
  border-bottom-color: var(--accent);
}
.hero-art .art-accent {
  background: var(--accent-soft);
}
.mode-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}
.mode-card {
  color: var(--text);
  text-decoration: none;
  transition:
    transform 0.18s,
    border-color 0.18s;
}
.mode-card:hover {
  transform: translateY(-4px);
  border-color: var(--accent);
}
.mode-icon {
  color: var(--accent);
  font-size: 32px;
}
.mode-kicker {
  color: var(--accent);
  font-size: 11px;
  margin: 20px 0 4px;
}
.mode-card h2 {
  font-size: 23px;
  margin: 4px 0 10px;
}
.mode-card h2 span {
  float: right;
  font-size: 20px;
  color: var(--muted);
}
.mode-card > p:last-child {
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 0;
}
.resume-content {
  display: grid;
  gap: 16px;
}
.resume-intro {
  margin: 0;
  font-size: 13px;
}
.resume-list {
  display: grid;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.resume-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  text-decoration: none;
  color: var(--text);
  transition:
    background-color 0.18s,
    border-color 0.18s;
}
.resume-card:hover,
.resume-card:active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.resume-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.resume-details {
  min-width: 0;
  overflow-wrap: anywhere;
}
.resume-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 16px;
}
.resume-difficulty {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 12px;
  font-weight: 500;
}
.resume-card p {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.6;
}
.resume-source {
  color: var(--muted);
}
.resume-progress {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-variant-numeric: tabular-nums;
}
.resume-card .resume-start {
  margin-top: 4px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.resume-action {
  font-size: 13px;
  color: var(--accent);
  white-space: nowrap;
}
.quarantine-message {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
@media (min-width: 701px) {
  .home-page {
    justify-content: center;
  }
  .mode-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }
}
@media (min-width: 1101px) {
  .mode-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (min-width: 1101px) and (min-height: 960px) {
  .home-intro {
    /* Remove top padding on tall desktops to raise the centered content and cards together. */
    padding: 0 0 80px;
  }
}
@media (max-width: 700px) {
  .home-page::before,
  .home-page::after {
    content: '';
    flex: 2 0 0;
  }
  .home-page::after {
    /* Share only spare height, keeping the full content group slightly above center. */
    flex-grow: 3;
  }
  .home-intro {
    grid-template-columns: 1fr;
    padding: 38px 0 32px;
  }
  .hero-art {
    display: none;
  }
  .mode-card {
    padding: 18px 22px;
  }
  .mode-icon {
    float: right;
  }
  .mode-kicker {
    margin-top: 0;
  }
}
@media (max-width: 600px) {
  .resume-card {
    gap: 12px;
    padding: 16px 14px;
  }
}
</style>
