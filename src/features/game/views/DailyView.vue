<script setup lang="ts">
import { NAlert, NButton } from 'naive-ui'
import { ref, watch, onMounted, onScopeDispose, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { useGameRuntime } from '@/infrastructure/runtime'
import { getChallengeDate } from '@/features/game/model/daily'
import GameView from '@/features/game/views/GameView.vue'
const runtime = useGameRuntime(),
  game = useGameStore(),
  route = useRoute()
const today = ref(getChallengeDate(runtime.wallNow()))
const formalCompleted = ref(false)
const localError = ref<string | null>(null)
const currentDate = computed(() =>
  game.session?.metadata.kind === 'daily' ? game.session.metadata.challengeDate : today.value,
)
let timer = 0
let initialization = 0
async function load() {
  const current = ++initialization
  const id =
    typeof route.query.session === 'string' ? route.query.session : `daily:${today.value}:formal`
  localError.value = null
  await game.leaveGame()
  if (current !== initialization) return
  const result = await runtime.repository.listSessions()
  if (current !== initialization) return
  if (!result.ok) {
    localError.value = '每日挑战存档读取失败，请重试。'
    return
  }
  const stored = result.value.find((record) => record.session.id === id)
  formalCompleted.value = !!result.value.find(
    (record) => record.session.id === `daily:${today.value}:formal`,
  )?.session.completion
  if (stored?.session.mode === 'daily') await game.restoreSession(id)
  else {
    await game.leaveGame()
    if (current !== initialization) return
    game.dropSession()
    if (route.query.session) localError.value = '找不到这份每日挑战存档，请开始今天的挑战。'
  }
}
watch(
  () => route.query.session,
  () => {
    void load()
  },
  { immediate: true },
)
onMounted(() => {
  timer = window.setInterval(() => {
    today.value = getChallengeDate(runtime.wallNow())
  }, 10000)
})
onScopeDispose(() => {
  initialization++
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
      <p>今天 · {{ today }} <span class="badge">中等难度</span></p>
      <p class="muted">
        每天北京时间零点更新。每个日期只有一次正式成绩；完成后重玩记为练习。跨日完成保留成绩，不计入连续挑战。
      </p>
      <p v-if="game.session?.metadata.kind === 'daily'">
        当前题目 · {{ currentDate }} ·
        {{ game.session.metadata.formalAttempt ? '正式挑战' : '练习重玩' }}
      </p>
      <NButton
        type="primary"
        :disabled="game.phase === 'generating'"
        @click="game.startDaily(today)"
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
.badge {
  background: var(--accent-soft);
  color: var(--accent);
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  margin-left: 10px;
}
</style>
