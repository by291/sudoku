<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { NAlert, NButton, NCard } from 'naive-ui'
import { useRecordsStore } from '@/features/records/stores/useRecordsStore'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import { sessionLink, modeName } from '@/features/records/model/records'
import { DIFFICULTY_NAMES, formatDuration } from '@/features/game/model/presentation'
const records = useRecordsStore(),
  preferences = usePreferencesStore()
const unfinished = computed(() => records.sessions.filter((record) => !record.session.completion))
const todayComplete = computed(() =>
  records.results.some(
    ({ session }) =>
      session.metadata.kind === 'daily' &&
      session.metadata.challengeDate === records.today &&
      session.metadata.formalAttempt,
  ),
)
onMounted(records.load)
</script>
<template>
  <section v-if="unfinished.length || preferences.settings.currentLessonId" class="resume-section">
    <h2>接着上次的思路</h2>
    <div class="resume-list">
      <RouterLink
        v-for="{ session } in unfinished"
        :key="session.id"
        :to="sessionLink(session)"
        class="panel resume-card"
        ><div>
          <strong>{{ modeName(session) }}</strong>
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
        >继续最近的课程 →</RouterLink
      >
    </div>
  </section>
  <section class="home-intro">
    <div>
      <p class="eyebrow">一点逻辑 · 一点耐心</p>
      <h1>一格一念，<br />慢慢解开。</h1>
      <p class="intro-copy">
        让数字各归其位，让思绪安静片刻。<br />从轻松一局开始，发现每一步的道理。
      </p>
      <RouterLink class="hero-link" to="/play/free">开始一局数独 <span>↗</span></RouterLink>
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
    <RouterLink to="/play/free" class="panel mode-card"
      ><span class="mode-icon">▦</span>
      <p class="mode-kicker">按自己的节奏</p>
      <h2>自由游玩 <span>↗</span></h2>
      <p>三个难度，随时暂停。把每一道题，慢慢想明白。</p></RouterLink
    ><RouterLink to="/learn" class="panel mode-card"
      ><span class="mode-icon">✎</span>
      <p class="mode-kicker">让每一步有理由</p>
      <h2>学习数独 <span>↗</span></h2>
      <p>从基础规则到数对技巧，跟着六节小课练习推理。</p></RouterLink
    ><RouterLink to="/play/daily" class="panel mode-card"
      ><span class="mode-icon">◷</span>
      <p class="mode-kicker">每天，一次小挑战</p>
      <h2>每日挑战 <span>↗</span></h2>
      <p>
        {{ records.today }} ·
        {{ todayComplete ? '正式挑战已完成，欢迎重玩' : '今天的中等难度棋盘，等你来解' }}
      </p></RouterLink
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
</template>
<style scoped>
.home-intro {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  align-items: center;
  gap: 50px;
  padding: 72px 0 58px;
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
.hero-link {
  display: inline-flex;
  gap: 32px;
  margin-top: 16px;
  padding: 14px 22px;
  border-radius: 10px;
  background: var(--accent);
  color: var(--accent-contrast);
  text-decoration: none;
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
.resume-section {
  margin-top: 24px;
}
.resume-section h2 {
  font-size: 21px;
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
