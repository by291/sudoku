<script setup lang="ts">
import { NAlert, NButton, NSelect } from 'naive-ui'
import { ref, watch, onMounted, onScopeDispose, computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { useGameRuntime } from '@/infrastructure/runtime'
import { getChallengeDate, getDailyIdentity } from '@/features/game/model/daily'
import type { DailyVariantStatus } from '@/features/game/model/daily'
import type { SudokuVariant } from '@/core/sudoku/rules'
import { isSudokuVariant } from '@/core/sudoku/rules'
import { parseVariantQuery, VARIANT_NAMES, VARIANT_OPTIONS } from '@/features/game/model/variants'
import GameView from '@/features/game/views/GameView.vue'
const runtime = useGameRuntime(),
  game = useGameStore(),
  route = useRoute(),
  router = useRouter()
const today = ref(getChallengeDate(runtime.wallNow()))
const selectedVariant = ref<SudokuVariant>('classic')
const variantOptions = [...VARIANT_OPTIONS]
const variantMenuOpen = ref(false)
const switching = ref(false)
const statuses = ref<readonly DailyVariantStatus[]>([])
const queryVariant = computed(() => parseVariantQuery(route.query.variant))
const formalCompleted = computed(() =>
  statuses.value.some(
    (status) => status.variant === selectedVariant.value && status.state === 'completed',
  ),
)
const localError = ref<string | null>(null)
const currentDate = computed(() =>
  game.session?.metadata.kind === 'daily' ? game.session.metadata.challengeDate : today.value,
)
let timer = 0
let initialization = 0
let statusLoad = 0
async function refreshStatuses() {
  const epoch = ++statusLoad
  const result = await game.loadDailyStatuses(today.value)
  if (epoch !== statusLoad) return
  if (result.ok) statuses.value = result.value
  else localError.value = '每日状态读取失败，请重试读取。'
}
async function load() {
  const current = ++initialization
  localError.value = null
  const variant = queryVariant.value
  if (!variant.valid) return
  const id =
    typeof route.query.session === 'string'
      ? route.query.session
      : getDailyIdentity(today.value, variant.value).formalId
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
  const transition = await game.startDaily(today.value, variant)
  switching.value = false
  if (transition.status === 'ready' && game.session?.mode === 'daily') {
    selectedVariant.value = game.activeVariant
    await router.replace({ query: { variant: game.activeVariant, session: game.session.id } })
    void refreshStatuses()
  }
}
function changeVariant(value: unknown) {
  if (isSudokuVariant(value)) void start(value)
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
  >
    <div class="daily-intro">
      <NAlert v-if="!queryVariant.valid" class="feedback-message" type="error" :show-icon="false"
        >无法识别指定的玩法。<RouterLink to="/play/daily">返回标准每日挑战</RouterLink></NAlert
      >
      <label class="variant-field"
        >每日玩法
        <NSelect
          v-model:show="variantMenuOpen"
          filterable
          :value="selectedVariant"
          :options="variantOptions"
          :disabled="switching || game.phase === 'generating' || !queryVariant.valid"
          :input-props="{
            role: 'combobox',
            'aria-label': '每日玩法',
            'aria-expanded': variantMenuOpen,
            'aria-controls': 'daily-variant-menu',
          }"
          :menu-props="{ id: 'daily-variant-menu', role: 'listbox', 'aria-label': '玩法选项' }"
          :node-props="
            (option) => ({ role: 'option', 'aria-selected': option.value === selectedVariant })
          "
          @update:value="changeVariant"
        />
      </label>
      <ul class="daily-statuses" aria-label="六种每日挑战状态">
        <li v-for="status in statuses" :key="status.variant">
          {{ VARIANT_NAMES[status.variant] }} ·
          {{
            status.state === 'completed'
              ? '已完成'
              : status.state === 'in-progress'
                ? '进行中'
                : '待开始'
          }}
        </li>
      </ul>
      <p>今天 · {{ today }} <span class="badge">中等难度</span></p>
      <p class="muted">
        每天北京时间零点更新，每种玩法各有一道中等题。每种玩法每个日期只有一次正式成绩；完成后重玩记为练习。跨日完成保留成绩，不计入连续挑战。
      </p>
      <p v-if="game.session?.metadata.kind === 'daily'">
        当前题目 · {{ currentDate }} ·
        {{ game.session.metadata.formalAttempt ? '正式挑战' : '练习重玩' }}
      </p>
      <NButton
        type="primary"
        :disabled="switching || game.phase === 'generating' || !queryVariant.valid"
        @click="start()"
      >
        {{ formalCompleted || game.session?.completion ? '重玩今日挑战' : '开始 / 继续今日挑战' }}
      </NButton>
    </div>
    <NAlert v-if="localError" class="feedback-message" type="error" :show-icon="false">
      {{ localError }} <NButton @click="load">重试读取</NButton>
    </NAlert>
  </GameView>
</template>
<style scoped>
.daily-intro {
  margin-bottom: 24px;
  max-width: 820px;
}
.variant-field {
  display: grid;
  gap: 8px;
  max-width: 280px;
}
.daily-statuses {
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
  list-style: none;
  font-size: 13px;
  color: var(--muted);
}
.badge {
  background: var(--accent-soft);
  color: var(--accent);
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  margin-left: 10px;
}
</style>
