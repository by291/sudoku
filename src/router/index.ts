import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '@/features/home/views/HomeView.vue'
import GameView from '@/features/game/views/GameView.vue'
import LearningView from '@/features/learning/views/LearningView.vue'
import LessonView from '@/features/learning/views/LessonView.vue'
import DailyView from '@/features/game/views/DailyView.vue'
import RecordsView from '@/features/records/views/RecordsView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/play/free', component: GameView },
    { path: '/learn', component: LearningView },
    { path: '/learn/:lessonId', component: LessonView },
    { path: '/play/daily', component: DailyView },
    { path: '/records', component: RecordsView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
