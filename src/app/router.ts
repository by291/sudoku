import { createRouter, createWebHashHistory } from 'vue-router'
import HomePage from './HomePage.vue'
import GamePage from '../features/game/GamePage.vue'
import LearningPage from '../features/learning/LearningPage.vue'
import LessonPage from '../features/learning/LessonPage.vue'
import DailyPage from '../features/game/DailyPage.vue'
import RecordsPage from '../features/records/RecordsPage.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: HomePage },
    { path: '/play/free', component: GamePage },
    { path: '/learn', component: LearningPage },
    { path: '/learn/:lessonId', component: LessonPage },
    { path: '/play/daily', component: DailyPage },
    { path: '/records', component: RecordsPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
