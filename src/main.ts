import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import { router } from '@/router/index'
import '@/styles/theme.css'
import '@/styles/global.css'
import { createGameRuntime, gameRuntimeKey } from '@/infrastructure/runtime'

createApp(App)
  .use(createPinia())
  .use(router)
  .provide(gameRuntimeKey, createGameRuntime())
  .mount('#app')
