<script setup lang="ts">
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'

useHead({ title: 'Mailer' })

const route = useRoute()
const router = useRouter()
const { api } = useApi()
const loggingOut = ref(false)

const isLoginPage = computed(() => route.path === '/login')

async function logout() {
  loggingOut.value = true
  try {
    await api('auth/logout', { method: 'POST' })
  } catch {
    // If the session already expired, redirect to login anyway.
  } finally {
    loggingOut.value = false
    await router.push('/login')
  }
}
</script>

<template>
  <NuxtPage v-if="isLoginPage" />

  <div v-else class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-icon">
          <i class="pi pi-send" />
        </div>
        <div>
          <strong>Mailer</strong>
          <span>Mini-Brevo</span>
        </div>
      </div>
      <nav>
        <NuxtLink to="/" :class="{ active: $route.path === '/' }">
          <i class="pi pi-home" /> Accueil
        </NuxtLink>
        <NuxtLink to="/radar" active-class="active">
          <i class="pi pi-bullseye" /> Aurel Radar
        </NuxtLink>
        <NuxtLink to="/product-markets" active-class="active">
          <i class="pi pi-globe" /> Product Markets
        </NuxtLink>
        <NuxtLink to="/prospects" active-class="active">
          <i class="pi pi-users" /> Prospects
        </NuxtLink>
        <NuxtLink to="/product-matcher" active-class="active">
          <i class="pi pi-sparkles" /> Product Matcher
        </NuxtLink>
        <NuxtLink to="/demo-personalizer" active-class="active">
          <i class="pi pi-images" /> Demo Personalizer
        </NuxtLink>
        <NuxtLink to="/pipeline" active-class="active">
          <i class="pi pi-chart-line" /> Pipeline commercial
        </NuxtLink>
        <NuxtLink to="/performance" active-class="active">
          <i class="pi pi-chart-bar" /> Performance produits
        </NuxtLink>
        <NuxtLink to="/campaigns" active-class="active">
          <i class="pi pi-envelope" /> Campagnes
        </NuxtLink>
        <NuxtLink to="/journal" active-class="active">
          <i class="pi pi-list" /> Journal
        </NuxtLink>
        <NuxtLink to="/usage" active-class="active">
          <i class="pi pi-chart-bar" /> Usage
        </NuxtLink>
        <NuxtLink to="/settings" active-class="active">
          <i class="pi pi-cog" /> Config
        </NuxtLink>
      </nav>
      <div class="sidebar-foot">
        <span class="muted">Prospection · IA · envoi</span>
        <Button
          icon="pi pi-sign-out"
          label="Déconnexion"
          text
          size="small"
          severity="secondary"
          :loading="loggingOut"
          @click="logout"
        />
      </div>
    </aside>
    <main class="main">
      <NuxtPage />
    </main>
  </div>
  <Toast position="top-right" />
  <ConfirmDialog />
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: var(--mailer-sidebar-width, 248px) minmax(0, 1fr);
  min-height: 100vh;
  min-height: 100dvh;
}

.sidebar {
  position: sticky;
  top: 0;
  align-self: start;
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: linear-gradient(180deg, #0b1220 0%, #0f172a 55%, #111827 100%);
  color: #e2e8f0;
  padding: 1.25rem 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  border-right: 1px solid rgba(148, 163, 184, 0.12);
  z-index: 20;
}

.brand {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.35rem 0.55rem 0.85rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.brand-icon {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: rgba(45, 212, 191, 0.14);
  color: #2dd4bf;
  flex-shrink: 0;
}

.brand-icon i {
  font-size: 1.05rem;
}

.brand strong {
  display: block;
  font-size: 1rem;
  letter-spacing: -0.02em;
}

.brand span {
  font-size: 0.72rem;
  color: #94a3b8;
}

nav {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1;
}

nav a {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.7rem 0.85rem;
  border-radius: 10px;
  color: #cbd5e1;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

nav a i {
  width: 1.1rem;
  text-align: center;
  opacity: 0.9;
}

nav a:hover {
  background: rgba(148, 163, 184, 0.1);
  color: #f8fafc;
}

nav a.active {
  background: rgba(45, 212, 191, 0.14);
  color: #5eead4;
  font-weight: 600;
}

.sidebar-foot {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.72rem;
  padding: 0.75rem 0.25rem 0.25rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.sidebar-foot .muted {
  padding: 0 0.3rem;
  color: #64748b;
}

.main {
  padding: 1.5rem 1.75rem 2rem;
  width: 100%;
  min-width: 0;
  max-width: none;
}

@media (max-width: 900px) {
  .shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: sticky;
    top: 0;
    height: auto;
    max-height: none;
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;
    padding: 0.65rem 0.75rem;
    overflow-x: auto;
    overflow-y: hidden;
    border-right: none;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    z-index: 30;
  }

  .brand {
    border-bottom: none;
    padding: 0.15rem 0.35rem;
    flex-shrink: 0;
  }

  .brand span {
    display: none;
  }

  nav {
    flex-direction: row;
    flex: 1;
  }

  nav a {
    white-space: nowrap;
    padding: 0.55rem 0.7rem;
  }

  .sidebar-foot {
    flex-direction: row;
    border-top: none;
    padding: 0;
  }

  .sidebar-foot .muted {
    display: none;
  }

  .main {
    padding: 1rem 1rem 1.5rem;
  }
}
</style>
