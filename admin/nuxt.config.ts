import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import Aura from '@primeuix/themes/aura'

const rootEnvPath = resolve(import.meta.dirname, '..', '.env')
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath)
}

const apiBase =
  process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3001/api'
const primeuiLicense = process.env.NUXT_PUBLIC_PRIMEUI_LICENSE || ''

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  ssr: false,
  modules: ['@primevue/nuxt-module'],
  css: ['primeicons/primeicons.css', '~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      apiBase,
      // @primevue/nuxt-module reads runtimeConfig.public.PRIMEUI_LICENSE
      PRIMEUI_LICENSE: primeuiLicense,
      primeui: {
        licenseKey: primeuiLicense,
      },
    },
  },
  primevue: {
    options: {
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: false,
        },
      },
      ripple: true,
    },
  },
  app: {
    head: {
      title: 'Mailer — Prospection',
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1',
        },
      ],
    },
  },
})
