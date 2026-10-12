<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { NAlert, NButton, NCard, NModal } from 'naive-ui'
import { useRecordsStore } from '@/features/records/stores/useRecordsStore'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import { sessionLink, modeName } from '@/features/records/model/records'
import { DIFFICULTY_NAMES, formatDuration } from '@/features/game/model/presentation'
import { VARIANT_NAMES } from '@/features/game/model/variants'
import { getDailyStatuses } from '@/features/game/model/daily'
import type { SudokuVariant } from '@/core/sudoku/rules'
import type { Difficulty } from '@/core/sudoku/types'
import GameSetupDialog from '@/features/game/components/GameSetupDialog.vue'
const router = useRouter()
const records = useRecordsStore(),
  preferences = usePreferencesStore()
const unfinished = computed(() => records.sessions.filter((record) => !record.session.completion))
const dailyStatuses = computed(() =>
  getDailyStatuses(records.sessions, records.results, records.today),
)
const completedDailyCount = computed(
  () => dailyStatuses.value.filter((status) => status.state === 'completed').length,
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
function openSetup(mode: 'free' | 'daily', event: MouseEvent) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
  setupMode.value = mode
  void records.load()
}
function startSelected() {
  const mode = setupMode.value
  if (!mode) return
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
  if (!selectedSave.value) return
  setupMode.value = null
  void router.push(sessionLink(selectedSave.value))
}
function continueLast(event: MouseEvent) {
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
  if (unfinished.value.length === 1) {
    const record = unfinished.value[0]
    if (record) void router.push(sessionLink(record.session))
  } else if (!unfinished.value.length && preferences.settings.currentLessonId) {
    void router.push(`/learn/${preferences.settings.currentLessonId}`)
  } else resumeOpen.value = true
}
function restoreResumeFocus() {
  const element: unknown = resumeButton.value?.$el
  if (element instanceof HTMLElement) element.focus()
}
onMounted(records.load)
</script>
<template>
  <div class="home-page">
    <NModal
      v-model:show="resumeOpen"
      preset="card"
      title="继续上次"
      aria-label="继续上次"
      class="resume-dialog"
      style="width: min(640px, calc(100vw - 32px)); margin: 24px auto"
      @after-leave="restoreResumeFocus"
    >
      <div class="resume-list">
        <RouterLink
          v-for="{ session } in unfinished"
          :key="session.id"
          :to="sessionLink(session)"
          class="panel resume-card"
          @click="resumeOpen = false"
          ><div>
            <strong
              >{{ VARIANT_NAMES[session.puzzle.rules.kind] }} · {{ modeName(session) }}</strong
            >
            <p class="muted">
              {{ DIFFICULTY_NAMES[session.puzzle.difficulty] }} · 已用时
              {{ formatDuration(session.elapsedMs) }}
            </p>
          </div>
          <span>继续 →</span></RouterLink
        ><RouterLink
          v-if="preferences.settings.currentLessonId"
          :to="`/learn/${preferences.settings.currentLessonId}`"
          class="resume-lesson"
          @click="resumeOpen = false"
          >继续最近的课程 →</RouterLink
        >
      </div>
    </NModal>
    <section class="home-intro">
      <div>
        <p class="eyebrow">一点逻辑 · 一点耐心</p>
        <h1>一格一念，<br />慢慢解开。</h1>
        <p class="intro-copy">
          让数字各归其位，让思绪安静片刻。<br />从轻松一局开始，发现每一步的道理。
        </p>
        <div class="hero-actions">
          <NButton type="primary" size="large" @click="openSetup('free', $event)"
            >开始一局数独 <span aria-hidden="true" class="action-arrow">↗</span></NButton
          >
          <NButton
            v-if="unfinished.length || preferences.settings.currentLessonId"
            ref="resumeButton"
            size="large"
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
      >
    </div>
    <NAlert v-if="records.error" class="feedback-message" type="error" :show-icon="false">
      {{ records.error }} <NButton @click="records.load">重试读取</NButton>
    </NAlert>
    <NCard v-if="records.quarantined" class="feedback-message" size="small" role="status">
      有 {{ records.quarantined }} 条记录已隔离。<RouterLink to="/records">查看并清理</RouterLink>
    </NCard>
    <section class="home-bottom">
      <p class="muted">每一局，都是一次专注的练习。数据保存在当前浏览器。</p>
      <RouterLink to="/records">我的数独足迹 →</RouterLink>
    </section>
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
  padding: clamp(40px, 6vh, 88px) 0;
  flex: 1;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
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
.resume-list {
  display: grid;
  gap: 12px;
}
.resume-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 24px;
  text-decoration: none;
  color: var(--text);
}
.resume-card p {
  font-size: 12px;
  margin: 4px 0 0;
}
.resume-card > span {
  font-size: 13px;
  color: var(--accent);
}
.resume-lesson {
  padding: 10px 0;
  font-size: 14px;
}
.home-bottom {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: center;
  border-top: 1px solid var(--border);
  margin-top: 44px;
  padding-top: 20px;
  font-size: 12px;
}
@media (max-width: 700px) {
  .home-intro {
    grid-template-columns: 1fr;
    padding: 38px 0 32px;
  }
  .hero-art {
    display: none;
  }
  .mode-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
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
  .home-bottom {
    align-items: flex-start;
    flex-direction: column;
  }
  .home-bottom p {
    margin: 0;
  }
}
</style>
