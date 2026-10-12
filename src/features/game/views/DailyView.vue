<script setup lang="ts">
import { NAlert, NButton, NModal, NProgress } from 'naive-ui'
import { ref, watch, onMounted, onScopeDispose, computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { useGameRuntime } from '@/infrastructure/runtime'
import { getChallengeDate } from '@/features/game/model/daily'
import type { DailyVariantStatus } from '@/features/game/model/daily'
import type { SudokuVariant } from '@/core/sudoku/rules'
import { parseVariantQuery } from '@/features/game/model/variants'
import GameView from '@/features/game/views/GameView.vue'
import GameSetupDialog from '@/features/game/components/GameSetupDialog.vue'
import type { Difficulty } from '@/core/sudoku/types'
const runtime = useGameRuntime(),
  game = useGameStore(),
  route = useRoute(),
  router = useRouter()
const today = ref(getChallengeDate(runtime.wallNow()))
const selectedVariant = ref<SudokuVariant>('classic')
const setupOpen = ref(false)
const rulesOpen = ref(false)
const difficulty = ref<Difficulty>('medium')
const switching = ref(false)
const statuses = ref<readonly DailyVariantStatus[]>([])
const statusesLoading = ref(false)
const completedCount = computed(
  () => statuses.value.filter((status) => status.state === 'completed').length,
)
const challengeRules =
  '每天北京时间零点更新，每种玩法各有一道中等题。每种玩法每个日期只有一次正式成绩；完成后重玩记为练习。跨日完成保留成绩，不计入连续挑战。'
const queryVariant = computed(() => parseVariantQuery(route.query.variant))
const localError = ref<string | null>(null)
const currentDate = computed(() =>
  game.session?.metadata.kind === 'daily' ? game.session.metadata.challengeDate : today.value,
)
let timer = 0
let initialization = 0
let statusLoad = 0
async function refreshStatuses() {
  const epoch = ++statusLoad
  statusesLoading.value = true
  const result = await game.loadDailyStatuses(today.value)
  if (epoch !== statusLoad) return
  statusesLoading.value = false
  if (result.ok) statuses.value = result.value
  else localError.value = '每日状态读取失败，请重试读取。'
}
async function load() {
  const current = ++initialization
  localError.value = null
  const variant = queryVariant.value
  if (!variant.valid) return
  const id = typeof route.query.session === 'string' ? route.query.session : null
  if (!id) {
    const transition = await game.clearActiveSession()
    if (current !== initialization) return
    if (transition.status === 'ready') {
      selectedVariant.value = variant.value
      if (route.query.start === '1') await start()
    } else if (game.session?.mode === 'daily') selectedVariant.value = game.activeVariant
    void refreshStatuses()
    return
  }
  if (game.session?.id === id) {
    selectedVariant.value = game.activeVariant
    void refreshStatuses()
    return
  }
  const result = await game.findSession(id)
  if (current !== initialization) return
  if (!result.ok) {
    localError.value = '每日挑战存档读取失败，请重试。'
    return
  }
  const stored = result.value
  if (stored?.session.mode === 'daily') {
    const transition = await game.restoreSession(id)
    if (current !== initialization) return
    if (transition.status === 'ready') selectedVariant.value = game.activeVariant
  } else {
    const transition = await game.clearActiveSession()
    if (current !== initialization) return
    if (transition.status === 'ready') selectedVariant.value = variant.value
    else if (game.session?.mode === 'daily') selectedVariant.value = game.activeVariant
    if (route.query.session) localError.value = '找不到这份每日挑战存档，请开始今天的挑战。'
  }
  void refreshStatuses()
}
async function start(variant = selectedVariant.value) {
  if (switching.value) return
  switching.value = true
  setupOpen.value = false
  const transition = await game.startDaily(today.value, variant)
  switching.value = false
  if (transition.status === 'ready' && game.session?.mode === 'daily') {
    selectedVariant.value = game.activeVariant
    await router.replace({ query: { variant: game.activeVariant, session: game.session.id } })
    void refreshStatuses()
  }
}
function openSetup(event?: MouseEvent) {
  if (event?.currentTarget instanceof HTMLElement) event.currentTarget.focus()
  selectedVariant.value =
    game.session?.mode === 'daily' ? game.activeVariant : selectedVariant.value
  setupOpen.value = true
  void refreshStatuses()
}
watch(
  () => [route.query.session, route.query.variant],
  () => {
    void load()
  },
  { immediate: true },
)
watch(
  () => game.saveState,
  (state) => {
    if (state === 'saved') void refreshStatuses()
  },
)
watch(today, () => {
  void refreshStatuses()
})
onMounted(() => {
  timer = window.setInterval(() => {
    today.value = getChallengeDate(runtime.wallNow())
  }, 10000)
})
onScopeDispose(() => {
  initialization++
  statusLoad++
  window.clearInterval(timer)
})
</script>
<template>
  <GameView
    :metadata="{ kind: 'daily', challengeDate: currentDate, formalAttempt: false }"
    heading="每日挑战"
    :auto-restore="false"
    @choose-daily="openSetup()"
  >
    <template #default="{ active }">
      <NAlert v-if="!queryVariant.valid" class="feedback-message" type="error" :show-icon="false">
        无法识别指定的玩法。
        <RouterLink v-slot="{ href, navigate }" to="/play/daily" custom>
          <NButton tag="a" :href="href" @click="navigate">返回标准每日挑战</NButton>
        </RouterLink>
      </NAlert>
      <section v-if="!active" class="daily-card" aria-label="今日挑战概览">
        <div class="daily-card-heading">
          <div>
            <p class="daily-date">{{ today }}</p>
            <h2>今天，解开一盘</h2>
            <p class="muted">六种玩法 · 每种一道中等题</p>
          </div>
          <div class="calendar-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48">
              <path
                d="M10 9h28v31H10V9ZM16 5v8m16-8v8M10 18h28"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
            </svg>
            <span>{{ today.slice(-2) }}</span>
          </div>
        </div>
        <div class="daily-progress">
          <span>今日已完成 {{ completedCount }} / 6 种玩法</span>
          <NProgress
            type="line"
            :percentage="(completedCount / 6) * 100"
            :show-indicator="false"
            color="var(--accent)"
            rail-color="var(--border)"
            :height="6"
            aria-label="今日挑战进度"
          />
        </div>
        <div class="daily-actions">
          <NButton
            type="primary"
            :disabled="switching || game.phase === 'generating' || !queryVariant.valid"
            @click="openSetup"
          >
            选择今日挑战
          </NButton>
          <NButton quaternary @click="rulesOpen = true">挑战规则</NButton>
        </div>
        <p class="daily-update muted">北京时间 00:00 更新 · 挑选玩法后开始</p>
      </section>
      <NAlert v-if="localError" class="feedback-message" type="error" :show-icon="false">
        {{ localError }} <NButton @click="load">重试读取</NButton>
      </NAlert>
      <GameSetupDialog
        v-if="setupOpen"
        v-model:variant="selectedVariant"
        v-model:difficulty="difficulty"
        mode="daily"
        :statuses="statuses"
        :busy="switching || statusesLoading"
        :error="localError"
        @cancel="setupOpen = false"
        @start="start()"
      />
      <NModal
        v-if="rulesOpen"
        :show="true"
        preset="card"
        title="每日挑战规则"
        aria-label="每日挑战规则"
        role="dialog"
        aria-modal="true"
        style="width: min(480px, calc(100vw - 32px)); margin: 24px auto"
        @update:show="rulesOpen = $event"
      >
        <p>{{ challengeRules }}</p>
        <template #footer><NButton @click="rulesOpen = false">关闭规则</NButton></template>
      </NModal>
    </template>
    <template #settings>
      <h3 class="daily-rules-heading">每日挑战规则</h3>
      <p class="muted">{{ challengeRules }}</p>
    </template>
  </GameView>
</template>
<style scoped>
.daily-card {
  max-width: 640px;
  margin: 24px auto 0;
  padding: 32px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
}
.daily-card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.daily-date {
  color: var(--accent);
  font-size: 13px;
  margin: 0 0 12px;
  font-variant-numeric: tabular-nums;
}
.daily-card h2 {
  margin: 0;
  font-size: 28px;
}
.daily-card-heading .muted {
  margin: 12px 0 0;
  font-size: 14px;
}
.calendar-mark {
  position: relative;
  flex-shrink: 0;
  width: 80px;
  height: 80px;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 16px;
}
.calendar-mark svg {
  width: 100%;
  height: 100%;
}
.calendar-mark span {
  position: absolute;
  inset: 38px 0 0;
  text-align: center;
  font-size: 20px;
  font-weight: 600;
}
.daily-progress {
  margin: 28px 0;
}
.daily-progress span {
  display: block;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--muted);
}
.daily-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.daily-update {
  margin: 20px 0 0;
  font-size: 12px;
}
.daily-rules-heading {
  margin: 20px 0 8px;
  font-size: 14px;
}
@media (max-width: 600px) {
  .daily-card {
    padding: 24px 20px;
  }
  .daily-card h2 {
    font-size: 24px;
  }
  .calendar-mark {
    width: 64px;
    height: 64px;
    border-radius: 12px;
  }
  .calendar-mark span {
    inset: 30px 0 0;
    font-size: 17px;
  }
}
</style>
