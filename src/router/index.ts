import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router'
import HomeView from '@/features/home/views/HomeView.vue'
import GameView from '@/features/game/views/GameView.vue'
import LearningView from '@/features/learning/views/LearningView.vue'
import LessonView from '@/features/learning/views/LessonView.vue'
import DailyView from '@/features/game/views/DailyView.vue'
import RecordsView from '@/features/records/views/RecordsView.vue'
import { LESSONS } from '@/features/learning/model/lessons'

declare module 'vue-router' {
  interface RouteMeta {
    parentNavigation?: (route: RouteLocationNormalizedLoaded) => {
      to: RouteLocationRaw
      label: string
    }
  }
}

export const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }

    const lessonViewChanged =
      typeof to.params.lessonId === 'string' &&
      (to.query.practice === '1') !== (from.query.practice === '1')
    const browsingTypeChanged =
      ['/learn', '/records'].includes(to.path) && to.query.variant !== from.query.variant

    // Browsing choices and practice flags change the view; session queries keep the board in place.
    return to.path !== from.path || lessonViewChanged || browsingTypeChanged
      ? { left: 0, top: 0 }
      : false
  },
  routes: [
    { path: '/', component: HomeView },
    { path: '/play/free', component: GameView },
    { path: '/learn', component: LearningView },
    {
      path: '/learn/:lessonId',
      component: LessonView,
      meta: {
        parentNavigation: (route) => {
          if (route.query.practice === '1') {
            return {
              to: `/learn/${encodeURIComponent(String(route.params.lessonId))}`,
              label: '返回本节课程',
            }
          }

          const lesson = LESSONS.find((item) => item.id === route.params.lessonId)

          return {
            to: lesson ? { path: '/learn', query: { variant: lesson.practiceVariant } } : '/learn',
            label: '返回课程列表',
          }
        },
      },
    },
    { path: '/play/daily', component: DailyView },
    { path: '/records', component: RecordsView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
