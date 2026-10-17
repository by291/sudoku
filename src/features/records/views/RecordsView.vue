<script setup lang="ts">
import { NAlert, NButton, NCard, NSelect } from 'naive-ui'
import { watch, onScopeDispose, ref, computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  parseVariantQuery,
  getVariantPresentation,
  VARIANT_OPTIONS,
} from '@/features/game/model/variants'
import { isSudokuVariant } from '@/sudoku/catalogue'
import { supportedDifficulties } from '@/sudoku/catalogue'
import { useRecordsStore } from '@/features/records/stores/useRecordsStore'
import { DIFFICULTY_NAMES, formatDuration } from '@/features/game/model/presentation'
import {
  groupCompletedSummaries,
  modeName,
  sessionLink,
  summarizeProjection,
} from '@/features/records/model/records'
import { useDelayedProgress } from '@/shared/composables/useDelayedProgress'
import ConfirmationDialog from '@/shared/components/ConfirmationDialog.vue'
import LocalBackupPanel from '@/features/records/components/LocalBackupPanel.vue'

const records = useRecordsStore()
const reader = Symbol('records-view')
onScopeDispose(() => records.releaseReader(reader))
const confirmation = ref<'clear' | 'quarantine' | null>(null)
const route = useRoute()
const router = useRouter()
const variantQuery = computed(() => parseVariantQuery(route.query.variant))
const variant = computed(() => (variantQuery.value.valid ? variantQuery.value.value : 'classic'))
const variantOptions = [...VARIANT_OPTIONS]
const recordTabs = [
  { value: 'overview', label: '总览' },
  { value: 'saves', label: '本地存档' },
  { value: 'history', label: '完成历史' },
]
const tab = computed(() =>
  route.query.tab === 'saves' || route.query.tab === 'history' ? route.query.tab : 'overview',
)
const showProgress = useDelayedProgress(() => records.busy)
const variantMenuOpen = ref(false)
const compactNavigationMedia = window.matchMedia('(max-width: 800px)')
const compactNavigation = ref(compactNavigationMedia.matches)
const summary = computed(() => records.summary)
const results = computed(() => records.rows)
const saves = computed(() => {
  const latest = records.rows.find((row) => !row.completedAt)
  return {
    latest: latest ? { session: latest, summary: summarizeProjection(latest) } : null,
    others: records.rows
      .filter((row) => row !== latest)
      .map((session) => ({
        session,
        summary: summarizeProjection(session),
      })),
  }
})
const historyGroups = computed(() => groupCompletedSummaries(records.rows))

watch(
  [tab, variant],
  ([selectedTab, selectedVariant]) => {
    void records.load({ tab: selectedTab, variant: selectedVariant }, reader)
  },
  { immediate: true },
)

function variantDestination(value: string) {
  return {
    path: '/records',
    query: { variant: value, ...(tab.value === 'overview' ? {} : { tab: tab.value }) },
  }
}

function updateTab(value: string | number) {
  if (value === 'overview' || value === 'saves' || value === 'history') {
    void router.push({ path: '/records', query: { ...route.query, tab: value } })
  }
}

// Naive UI 2.45.3 tabs omit keyboard semantics; controlled buttons keep this tablist accessible.
function navigateTabs(event: KeyboardEvent, value: string) {
  const index = recordTabs.findIndex((item) => item.value === value)
  let nextIndex: number
  switch (event.key) {
    case 'ArrowRight':
      nextIndex = (index + 1) % recordTabs.length
      break
    case 'ArrowLeft':
      nextIndex = (index + recordTabs.length - 1) % recordTabs.length
      break
    case 'Home':
      nextIndex = 0
      break
    case 'End':
      nextIndex = recordTabs.length - 1
      break
    default:
      return
  }
  event.preventDefault()
  const next = recordTabs[nextIndex]
  if (next) {
    updateTab(next.value)
    document.getElementById(`records-tab-${next.value}`)?.focus()
  }
}

function updateVariant(value: unknown) {
  if (isSudokuVariant(value)) {
    void router.push(variantDestination(value))
  }
}

function updateNavigationLayout() {
  compactNavigation.value = compactNavigationMedia.matches
  variantMenuOpen.value = false
}

compactNavigationMedia.addEventListener('change', updateNavigationLayout)
onScopeDispose(() => compactNavigationMedia.removeEventListener('change', updateNavigationLayout))

function requestConfirmation(action: 'clear' | 'quarantine', event: MouseEvent) {
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.focus()
  }

  confirmation.value = action
}

async function confirm() {
  const action = confirmation.value
  confirmation.value = null
  if (action === 'clear') {
    await records.clearLocalData()
  } else {
    await records.removeQuarantined()
  }
}

function duration(value: number | null | undefined) {
  return value == null ? '—' : formatDuration(value)
}
</script>
<template>
  <section class="records-page">
    <header class="records-heading">
      <p class="eyebrow">一点积累 / RECORDS</p>
      <h1>我的数独足迹</h1>
      <p class="muted">成绩和存档只属于当前浏览器。定期导出备份，可以在数据丢失后恢复。</p>
      <div class="loading-slot" :aria-busy="records.busy">
        <p v-if="showProgress" role="status" aria-live="polite">正在处理本机记录…</p>
      </div>
    </header>
    <NAlert v-if="records.error" class="feedback-message" type="error" :show-icon="false">
      {{ records.error }}
      <NButton :disabled="records.busy" @click="records.retry">重试读取</NButton>
    </NAlert>
    <NCard v-if="records.notice" class="feedback-message" size="small" role="status">
      {{ records.notice }}
    </NCard>
    <NAlert v-if="!variantQuery.valid" class="feedback-message" type="warning" :show-icon="false">
      无法识别这个成绩玩法，请重新选择。
      <RouterLink v-slot="{ href, navigate }" to="/records" custom>
        <NButton tag="a" :href="href" @click="navigate">查看标准成绩</NButton>
      </RouterLink>
    </NAlert>
    <NAlert v-if="records.pending" class="feedback-message" type="info" :show-icon="false">
      旧存档需要整理，完成后可查看完整记录。
      <NButton :disabled="records.busy" @click="records.retry">整理存档并重试</NButton>
    </NAlert>
    <div class="records-workspace">
      <aside v-if="!compactNavigation" class="records-sidebar">
        <h2 class="sidebar-heading">选择玩法</h2>
        <nav class="records-navigation" aria-label="成绩玩法">
          <RouterLink
            v-for="choice in VARIANT_OPTIONS"
            :key="choice.value"
            v-slot="{ href, navigate }"
            :to="variantDestination(choice.value)"
            custom
          >
            <NButton
              tag="a"
              :href="href"
              :aria-current="variant === choice.value ? 'page' : undefined"
              :type="variant === choice.value ? 'primary' : 'default'"
              :quaternary="variant !== choice.value"
              class="records-choice"
              @click="navigate"
            >
              <span class="choice-name">{{ choice.label }}</span>
              <span class="choice-count"
                >{{
                  choice.value === variant && records.completedCount !== null
                    ? records.completedCount
                    : '—'
                }}
                局</span
              >
            </NButton>
          </RouterLink>
        </nav>
        <div class="records-total">
          <p>我的完成记录</p>
          <span class="muted">选择玩法查看对应成绩</span>
        </div>
      </aside>
      <label v-else class="variant-field"
        >成绩玩法
        <NSelect
          v-model:show="variantMenuOpen"
          filterable
          :value="variant"
          :options="variantOptions"
          :input-props="{
            role: 'combobox',
            'aria-label': '成绩玩法',
            'aria-expanded': variantMenuOpen,
            'aria-controls': 'records-variant-menu',
          }"
          :menu-props="{ id: 'records-variant-menu', role: 'listbox', 'aria-label': '玩法选项' }"
          :node-props="(option) => ({ role: 'option', 'aria-selected': option.value === variant })"
          @update:value="updateVariant"
        />
      </label>
      <section class="records-content" :aria-label="`${getVariantPresentation(variant).label}成绩`">
        <div class="record-tabs" role="tablist" aria-label="记录分类">
          <NButton
            v-for="item in recordTabs"
            :id="`records-tab-${item.value}`"
            :key="item.value"
            role="tab"
            :aria-selected="tab === item.value"
            :aria-controls="`records-panel-${item.value}`"
            :tabindex="tab === item.value ? 0 : -1"
            :type="tab === item.value ? 'primary' : 'default'"
            @click="updateTab(item.value)"
            @keydown="navigateTabs($event, item.value)"
            >{{ item.label }}</NButton
          >
        </div>
        <section
          v-if="tab === 'overview'"
          id="records-panel-overview"
          role="tabpanel"
          aria-labelledby="records-tab-overview"
          class="records-tab-panel"
        >
          <div :aria-busy="records.busy || !records.loaded">
            <div class="records-summary">
              <div class="records-overview">
                <p class="eyebrow">按玩法积累</p>
                <h2>{{ getVariantPresentation(variant).label }}</h2>
                <p class="completion-count">已完成 {{ records.completedCount ?? '—' }} 局</p>
                <p class="muted">难度与最快成绩按玩法分别计算。</p>
              </div>
              <div class="stat-grid">
                <div class="panel stat">
                  <span>当前连续挑战</span
                  ><strong>{{ summary?.currentStreak ?? '—' }} <small>天</small></strong>
                </div>
                <div class="panel stat">
                  <span>最长连续挑战</span
                  ><strong>{{ summary?.longestStreak ?? '—' }} <small>天</small></strong>
                </div>
                <div class="panel stat">
                  <span>正式挑战完成</span
                  ><strong
                    >{{
                      summary ? summary.dailyTotals.unassisted + summary.dailyTotals.assisted : '—'
                    }}
                    <small>次</small></strong
                  >
                  <p>
                    无辅助 {{ summary?.dailyTotals.unassisted ?? '—' }} · 辅助
                    {{ summary?.dailyTotals.assisted ?? '—' }}
                  </p>
                </div>
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
                  <tr v-for="difficulty in supportedDifficulties(variant)" :key="difficulty">
                    <th scope="row">{{ DIFFICULTY_NAMES[difficulty] }}</th>
                    <td>{{ duration(summary?.freeBests[difficulty].unassisted) }}</td>
                    <td>{{ duration(summary?.freeBests[difficulty].assisted) }}</td>
                  </tr>
                </tbody>
              </table>
              <p class="muted small">
                学习实战和每日练习不参与自由游玩最快成绩。正式挑战在题目日期当天完成才计入连续天数。
              </p>
            </section>
          </div>
        </section>
        <section
          v-else-if="tab === 'saves'"
          id="records-panel-saves"
          role="tabpanel"
          aria-labelledby="records-tab-saves"
          class="records-tab-panel"
        >
          <section
            class="save-list"
            aria-label="本地存档"
            :aria-busy="records.busy || !records.loaded"
          >
            <h2>{{ getVariantPresentation(variant).label }}</h2>
            <p v-if="records.loaded && !saves.latest && !saves.others.length" class="muted">
              这个玩法还没有本地存档，开始一局后会自动保存在这里。
            </p>
            <article v-if="!records.loaded" class="panel record-placeholder" aria-hidden="true">
              <h3>—</h3>
              <p class="muted">已填 — / — 格 · 已用时 —</p>
              <p class="muted small">开始于 —</p>
            </article>
            <article v-if="saves.latest" class="panel latest-save">
              <p class="eyebrow">最近开始 · 进行中</p>
              <h3>{{ modeName(saves.latest.session) }}</h3>
              <p class="muted">
                {{ DIFFICULTY_NAMES[saves.latest.session.difficulty] }} ·
                {{ saves.latest.summary.progressLabel }} · 已用时
                {{ formatDuration(saves.latest.session.elapsedMs) }}
              </p>
              <p class="muted small">
                开始于
                <time :datetime="saves.latest.session.startedAt">{{
                  saves.latest.summary.startedAtLabel
                }}</time>
              </p>
              <RouterLink
                v-slot="{ href, navigate }"
                :to="sessionLink(saves.latest.session)"
                custom
              >
                <NButton tag="a" :href="href" type="primary" class="resume-button" @click="navigate"
                  >继续存档</NButton
                >
              </RouterLink>
            </article>
            <ul v-if="saves.others.length" class="stored-sessions">
              <li
                v-for="{ session, summary: saveSummary } in saves.others"
                :key="session.id"
                class="panel stored-session"
              >
                <div>
                  <h3>{{ modeName(session) }}</h3>
                  <p class="muted">
                    {{ DIFFICULTY_NAMES[session.difficulty] }} · {{ saveSummary.progressLabel }} ·
                    已用时 {{ formatDuration(session.elapsedMs) }} ·
                    {{ session.completedAt ? '已完成' : '进行中' }}
                  </p>
                  <p class="muted small">
                    开始于
                    <time :datetime="session.startedAt">{{ saveSummary.startedAtLabel }}</time>
                  </p>
                </div>
                <RouterLink v-slot="{ href, navigate }" :to="sessionLink(session)" custom>
                  <NButton tag="a" :href="href" @click="navigate">{{
                    session.completedAt ? '查看存档' : '继续存档'
                  }}</NButton>
                </RouterLink>
              </li>
            </ul>
          </section>
        </section>
        <section
          v-else
          id="records-panel-history"
          role="tabpanel"
          aria-labelledby="records-tab-history"
          class="records-tab-panel"
        >
          <section
            class="history"
            aria-label="完成历史"
            :aria-busy="records.busy || !records.loaded"
          >
            <h2>{{ getVariantPresentation(variant).label }}</h2>
            <p v-if="records.loaded && !results.length" class="muted">
              这个玩法还没有完成记录，先享受解题的过程吧。
            </p>
            <section v-if="!records.loaded" class="panel record-placeholder" aria-hidden="true">
              <h3>—</h3>
              <p class="muted">完成时间 — · 用时 —</p>
            </section>
            <section v-for="group in historyGroups" :key="group.date" class="panel history-date">
              <h3>
                <time :datetime="group.date">{{ group.label }}</time>
              </h3>
              <ul>
                <li v-for="session in group.records" :key="session.id">
                  <RouterLink
                    :to="{
                      path: `/records/${encodeURIComponent(session.id)}`,
                      query: { variant },
                    }"
                    class="history-link"
                  >
                    <div>
                      <strong
                        >{{ getVariantPresentation(session.variant).label }} ·
                        {{ modeName(session) }}</strong
                      >
                      <p class="muted">
                        {{ DIFFICULTY_NAMES[session.difficulty] }} ·
                        {{
                          session.completedAt
                            ? new Date(session.completedAt).toLocaleTimeString('zh-CN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''
                        }}
                      </p>
                    </div>
                    <div class="history-time">
                      {{ formatDuration(session.elapsedMs)
                      }}<span>{{ session.assisted ? '辅助完成' : '无辅助完成' }}</span
                      ><span class="open-record">查看棋局 →</span>
                    </div>
                  </RouterLink>
                </li>
              </ul>
            </section>
          </section>
        </section>
        <nav
          v-if="tab !== 'overview' && (records.pageNumber > 1 || records.nextCursor)"
          class="record-pagination"
          aria-label="记录分页"
        >
          <NButton
            :disabled="records.busy || records.pageNumber === 1"
            @click="records.changePage('previous')"
            >上一页</NButton
          >
          <span>第 {{ records.pageNumber }} 页</span>
          <NButton
            :disabled="records.busy || !records.nextCursor"
            @click="records.changePage('next')"
            >下一页</NButton
          >
        </nav>
        <NCard v-if="records.quarantined" class="feedback-message" size="small" role="status">
          <p>{{ records.quarantined }} 条损坏或不兼容的记录已隔离，有效数据仍可使用。</p>
          <NButton @click="requestConfirmation('quarantine', $event)">清理损坏记录</NButton>
        </NCard>
        <div class="data-actions">
          <LocalBackupPanel />
          <NButton :disabled="records.busy" @click="requestConfirmation('clear', $event)"
            >清空本机数据</NButton
          >
        </div>
      </section>
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
.loading-slot {
  /* Reuse the heading gap so delayed feedback preserves short-screen record density. */
  position: absolute;
  inset-inline: 0;
  top: 100%;
  display: flex;
  align-items: center;
  height: var(--page-heading-space);
  font-size: 12px;
  line-height: 16px;
}
.loading-slot p {
  margin: 0;
}
.record-placeholder {
  min-height: 140px;
}
.record-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
}

.records-page {
  padding-top: var(--page-top-space);
}
.records-heading {
  position: relative;
  margin-bottom: var(--page-heading-space);
}
.records-workspace {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  align-items: start;
  gap: 32px;
}
.records-sidebar {
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
.records-navigation {
  display: grid;
  gap: 8px;
}
.records-choice {
  height: auto;
  min-height: 52px;
  padding: 12px;
  border-radius: 10px;
}
.records-choice :deep(.n-button__content) {
  width: 100%;
  justify-content: space-between;
  gap: 12px;
}
.records-choice[aria-current='page'] .choice-name {
  font-weight: 700;
}
.choice-count {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.records-total {
  margin: 20px 12px 0;
  padding-top: 20px;
  border-top: 1px solid var(--border);
  font-size: 12px;
}
.records-total p {
  margin: 0 0 12px;
  font-size: 13px;
}
.variant-field {
  display: grid;
  gap: 8px;
}
.records-content {
  min-width: 0;
}
.record-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.records-overview {
  padding: 28px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--accent-soft);
}
.records-overview h2 {
  margin: 0;
  font-size: 28px;
}
.completion-count {
  margin: 12px 0 0;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.records-overview > .muted {
  margin: 8px 0 0;
  font-size: 13px;
}
h1 {
  font-size: 30px;
  margin: 8px 0 12px;
}
.eyebrow {
  margin: 0 0 8px;
  color: var(--accent);
  font-size: 12px;
  letter-spacing: 2px;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin: 24px 0;
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
  border-bottom: 1px solid var(--border);
}
.history li:last-child {
  border-bottom: 0;
}
.history-link {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 18px 0;
  color: inherit;
  text-decoration: none;
}
.history-link:hover {
  color: var(--accent);
}
.history-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}
.history-date {
  margin-top: 16px;
}
.history-date h3 {
  margin: 0 0 8px;
  font-size: 16px;
}
.open-record {
  margin-top: 8px;
  color: var(--accent);
}
.latest-save {
  background: var(--accent-soft);
  margin-bottom: 16px;
}
.stored-sessions {
  display: grid;
  gap: 12px;
  padding: 0;
  list-style: none;
}
.stored-session {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.save-list h3 {
  margin: 0;
  font-size: 17px;
}
.save-list p {
  margin: 8px 0;
}
.record-tabs :deep(.n-button) {
  min-height: 44px;
}
.records-tab-panel {
  padding-top: 20px;
}
.save-list :deep(.n-button) {
  min-height: 44px;
}
@media (max-width: 480px) {
  .stored-session,
  .history-link {
    align-items: start;
    flex-direction: column;
    gap: 12px;
  }
  .history-time {
    text-align: left;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
  .history-time .open-record {
    margin-top: 0;
  }
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
@media (min-width: 801px) and (max-height: 1000px) {
  h1 {
    margin: 4px 0 8px;
    font-size: 28px;
  }
  .records-heading > p:last-of-type {
    margin: 0;
  }
  .eyebrow {
    margin-bottom: 4px;
  }
  .records-workspace {
    gap: 24px;
  }
  .records-tab-panel {
    padding-top: 12px;
  }
  .records-sidebar {
    top: 16px;
    padding: 16px 12px;
  }
  .records-navigation {
    gap: 4px;
  }
  .records-choice {
    min-height: 44px;
    padding: 8px 12px;
  }
  .records-total {
    margin-top: 12px;
    padding-top: 12px;
  }
  .records-overview {
    padding: 16px;
  }
  .records-overview h2 {
    font-size: 24px;
  }
  .completion-count {
    margin-top: 8px;
  }
  .stat-grid {
    gap: 12px;
    margin: 16px 0;
  }
  .stat,
  .bests,
  .history-date {
    padding: 16px;
  }
  .stat strong {
    font-size: 32px;
  }
  .stat p {
    margin: 4px 0 0;
  }
  .bests,
  .history {
    margin: 16px 0;
  }
  h2 {
    font-size: 18px;
    margin-bottom: 12px;
  }
  th,
  td {
    padding: 6px 8px;
  }
  .history-link {
    padding: 12px 0;
  }
  .history-time {
    font-size: 18px;
  }
}
@media (min-width: 1100px) and (max-height: 1000px) {
  .records-summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    align-items: stretch;
    gap: 16px;
  }
  .stat-grid {
    gap: 8px;
    margin: 0;
  }
}
@media (max-width: 800px) {
  .records-workspace {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }
}
@media (max-width: 600px) {
  h1 {
    font-size: 25px;
  }
  .records-overview {
    padding: 20px;
  }
  .records-overview h2 {
    font-size: 24px;
  }
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
