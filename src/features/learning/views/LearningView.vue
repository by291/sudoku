<script setup lang="ts">
import { NAlert, NButton } from 'naive-ui'
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { LESSONS } from '@/features/learning/model/lessons'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
const learning = useLearningStore()
onMounted(learning.load)
</script>
<template>
  <section class="learning-page">
    <RouterLink to="/">← 返回首页</RouterLink>
    <p class="eyebrow">循序渐进 / LEARN</p>
    <h1>从看懂一格，到解开整盘</h1>
    <p class="muted">六节标准数独课与五种变体规则，学会让每次落笔都有理由。</p>
    <NAlert v-if="learning.error" class="feedback-message" type="error" :show-icon="false">
      {{ learning.error }} <NButton @click="learning.load">重试</NButton>
    </NAlert>
    <div class="lesson-grid">
      <RouterLink
        v-for="(lesson, index) in LESSONS"
        :key="lesson.id"
        :to="`/learn/${lesson.id}`"
        class="panel lesson-card"
        ><span class="lesson-number">{{ String(index + 1).padStart(2, '0') }}</span
        ><span class="status">{{
          learning.progress.some((item) => item.lessonId === lesson.id) ? '✓ 已完成' : '开始学习 →'
        }}</span>
        <h2>{{ lesson.title }}</h2>
        <p>{{ lesson.introduction }}</p></RouterLink
      >
    </div>
  </section>
</template>
<style scoped>
.learning-page {
  padding-top: 40px;
}
h1 {
  font-size: 30px;
  margin: 8px 0;
}
.eyebrow {
  color: var(--accent);
  font-size: 12px;
  letter-spacing: 2px;
}
.lesson-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin-top: 30px;
}
.lesson-card {
  text-decoration: none;
  color: var(--text);
}
.lesson-number {
  color: var(--accent);
  font-size: 26px;
}
.status {
  float: right;
  color: var(--accent);
  font-size: 12px;
}
.lesson-card h2 {
  font-size: 21px;
}
.lesson-card p {
  font-size: 14px;
  color: var(--muted);
}
@media (max-width: 600px) {
  .lesson-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .learning-page h1 {
    font-size: 25px;
  }
}
</style>
