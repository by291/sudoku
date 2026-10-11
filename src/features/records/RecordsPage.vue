<script setup lang="ts">
import { NAlert, NButton, NCard } from 'naive-ui'
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useRecordsStore } from './useRecordsStore'
import { DIFFICULTY_NAMES, formatDuration } from '../game/presentation'
import { modeName } from './records'
import ConfirmationDialog from '../game/ConfirmationDialog.vue'
const records = useRecordsStore(),
  confirmation = ref<'clear' | 'quarantine' | null>(null)
onMounted(records.load)
function requestConfirmation(action: 'clear' | 'quarantine', event: MouseEvent) {
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
  confirmation.value = action
}
async function confirm() {
  const action = confirmation.value
  confirmation.value = null
  if (action === 'clear') await records.clearLocalData()
  else await records.removeQuarantined()
}
function duration(value: number | null) {
  return value === null ? '—' : formatDuration(value)
}
</script>
<template>
  <section class="records-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">一点积累 / RECORDS</p>
        <h1>我的数独足迹</h1>
      </div>
      <RouterLink to="/">返回首页</RouterLink>
    </div>
    <p class="muted">成绩和存档只属于当前浏览器。清空浏览器数据后将无法恢复。</p>
    <NAlert v-if="records.error" class="feedback-message" type="error" :show-icon="false">
      {{ records.error }} <NButton @click="records.load">重试读取</NButton>
    </NAlert>
    <NCard v-if="records.notice" class="feedback-message" size="small" role="status">
      {{ records.notice }}
    </NCard>
    <p v-if="records.busy" role="status">正在处理本机记录…</p>
    <div class="stat-grid">
      <div class="panel stat">
        <span>当前连续挑战</span
        ><strong>{{ records.summary.currentStreak }} <small>天</small></strong>
      </div>
      <div class="panel stat">
        <span>最长连续挑战</span
        ><strong>{{ records.summary.longestStreak }} <small>天</small></strong>
      </div>
      <div class="panel stat">
        <span>正式挑战完成</span
        ><strong
          >{{ records.summary.dailyTotals.unassisted + records.summary.dailyTotals.assisted }}
          <small>次</small></strong
        >
        <p>
          无辅助 {{ records.summary.dailyTotals.unassisted }} · 辅助
          {{ records.summary.dailyTotals.assisted }}
        </p>
      </div>
    </div>
    <section class="panel bests">
      <h2>自由游玩 · 最快成绩</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">难度</th>
            <th scope="col">无辅助</th>
            <th scope="col">辅助完成</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(best, difficulty) in records.summary.freeBests" :key="difficulty">
            <th scope="row">{{ DIFFICULTY_NAMES[difficulty] }}</th>
            <td>{{ duration(best.unassisted) }}</td>
            <td>{{ duration(best.assisted) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="muted small">
        学习实战和每日练习不参与自由游玩最快成绩。正式挑战在题目日期当天完成才计入连续天数。
      </p>
    </section>
    <section class="panel history">
      <h2>完成记录</h2>
      <p v-if="!records.results.length" class="muted">还没有完成记录，先享受解题的过程吧。</p>
      <ul v-else>
        <li v-for="{ session } in records.results" :key="session.id">
          <div>
            <strong>{{ modeName(session) }}</strong>
            <p class="muted">
              {{ DIFFICULTY_NAMES[session.puzzle.difficulty] }} ·
              {{
                session.completion
                  ? new Date(session.completion.completedAt).toLocaleString('zh-CN')
                  : ''
              }}
            </p>
          </div>
          <div class="history-time">
            {{ formatDuration(session.elapsedMs)
            }}<span>{{ session.assistance.assisted ? '辅助完成' : '无辅助完成' }}</span>
          </div>
        </li>
      </ul>
    </section>
    <NCard v-if="records.quarantined" class="feedback-message" size="small" role="status">
      <p>{{ records.quarantined }} 条损坏或不兼容的记录已隔离，有效数据仍可使用。</p>
      <NButton @click="requestConfirmation('quarantine', $event)">清理损坏记录</NButton>
    </NCard>
    <div class="data-actions">
      <NButton :disabled="records.busy" @click="requestConfirmation('clear', $event)"
        >清空本机数据</NButton
      >
    </div>
    <ConfirmationDialog
      v-if="confirmation"
      destructive
      :title="confirmation === 'clear' ? '清空本机数据？' : '清理损坏记录？'"
      :description="
        confirmation === 'clear'
          ? '将删除所有存档、成绩、课程进度和设置，其他标签页也会停止当前游戏。此操作无法撤销。'
          : '仅删除已隔离的损坏记录，保留所有有效存档、成绩和设置。'
      "
      :confirm-label="confirmation === 'clear' ? '确认清空' : '确认清理'"
      @cancel="confirmation = null"
      @confirm="confirm"
    />
  </section>
</template>
<style scoped>
.records-page {
  padding-top: 32px;
}
.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
h1 {
  font-size: 32px;
  margin: 8px 0;
}
.eyebrow {
  color: var(--accent);
  font-size: 12px;
  letter-spacing: 2px;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  margin: 30px 0;
}
.stat span {
  display: block;
  color: var(--muted);
  font-size: 13px;
}
.stat strong {
  display: block;
  font-size: 40px;
  color: var(--accent);
  font-weight: 500;
}
.stat small,
.stat p {
  font-size: 12px;
}
.bests,
.history {
  margin: 24px 0;
}
h2 {
  margin-top: 0;
  font-size: 20px;
}
table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
th,
td {
  border-bottom: 1px solid var(--border);
  padding: 14px 8px;
}
.small {
  font-size: 12px;
}
.history ul {
  padding: 0;
  list-style: none;
  margin: 0;
}
.history li {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 0;
  border-bottom: 1px solid var(--border);
}
.history p {
  margin: 4px 0 0;
  font-size: 12px;
}
.history-time {
  text-align: right;
  font-size: 20px;
  flex-shrink: 0;
}
.history-time span {
  display: block;
  font-size: 11px;
  color: var(--muted);
}
.data-actions {
  margin-top: 24px;
}
@media (max-width: 600px) {
  .stat-grid {
    gap: 8px;
  }
  .stat {
    padding: 12px;
  }
  .stat strong {
    font-size: 28px;
  }
  .stat span {
    font-size: 11px;
  }
  .panel.bests,
  .panel.history {
    padding: 16px;
  }
}
</style>
