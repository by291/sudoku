import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import { router } from '@/router/index'
import '@/styles/theme.css'
import '@/styles/global.css'
import { gameRuntimeKey } from '@/runtime'
import type { GameRuntime } from '@/runtime'

const app = createApp(App, {
  installRuntime(runtime: GameRuntime) {
    app.provide(gameRuntimeKey, runtime)
  },
})

app.use(createPinia()).use(router).mount('#app')
