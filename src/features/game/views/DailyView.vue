<script setup lang="ts">
import { NAlert, NButton, NModal, NProgress } from 'naive-ui'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import GameView from '@/features/game/views/GameView.vue'
import GameSetupDialog from '@/features/game/components/GameSetupDialog.vue'
import { useDailyEntry } from '@/features/game/composables/useDailyEntry'

const {
  game,
  today,
  selectedVariant,
  setupOpen,
  difficulty,
  switching,
  statuses,
  statusesLoading,
  completedCount,
  queryVariant,
  localError,
  currentDate,
  load,
  start,
  openSetup,
} = useDailyEntry()
const rulesOpen = ref(false)
const challengeRules =
  '每天北京时间零点更新，每种玩法各有一道中等题。每种玩法每个日期只有一次正式成绩；完成后重玩记为练习。跨日完成保留成绩，不计入连续挑战。'
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
