import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router'
import { lessonVariant } from '@/features/learning/model/lessonIds'

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
    { path: '/', component: () => import('@/features/home/views/HomeView.vue') },
    { path: '/play/free', component: () => import('@/features/game/views/GameView.vue') },
    { path: '/learn', component: () => import('@/features/learning/views/LearningView.vue') },
    {
      path: '/learn/:lessonId',
      component: () => import('@/features/learning/views/LessonView.vue'),
      meta: {
        parentNavigation: (route) => {
          if (route.query.practice === '1') {
            return {
              to: `/learn/${encodeURIComponent(String(route.params.lessonId))}`,
              label: '返回本节课程',
            }
          }

          const variant = lessonVariant(route.params.lessonId)

          return {
            to: variant ? { path: '/learn', query: { variant } } : '/learn',
            label: '返回课程列表',
          }
        },
      },
    },
    { path: '/play/daily', component: () => import('@/features/game/views/DailyView.vue') },
    { path: '/records', component: () => import('@/features/records/views/RecordsView.vue') },
    {
      path: '/records/:id',
      component: () => import('@/features/records/views/ResultView.vue'),
      meta: {
        parentNavigation: (route) => ({
          to: { path: '/records', query: { variant: route.query.variant, tab: 'history' } },
          label: '返回完成历史',
        }),
      },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
