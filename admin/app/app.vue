<script setup lang="ts">
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'

useHead({ title: 'Atelys · Aurel' })

const route = useRoute()
const router = useRouter()
const { api } = useApi()
const loggingOut = ref(false)
const atelysLogo = 'data:image/webp;base64,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'

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
      <NuxtLink to="/" class="brand" aria-label="Atelys — Accueil">
        <img :src="atelysLogo" alt="Atelys — Atelier numérique sur mesure" class="brand-logo" />
      </NuxtLink>

      <nav>
        <div class="nav-label">Centre de contrôle</div>
        <NuxtLink to="/" :class="{ active: $route.path === '/' }">
          <i class="pi pi-home" /> <span>Aurel au rapport</span>
        </NuxtLink>
        <NuxtLink to="/radar" active-class="active">
          <i class="pi pi-bullseye" /> <span>Aurel Radar</span>
        </NuxtLink>
        <NuxtLink to="/acquisition" active-class="active">
          <i class="pi pi-compass" /> <span>Acquisition</span>
        </NuxtLink>
        <NuxtLink to="/aurel-ops" active-class="active">
          <i class="pi pi-sliders-h" /> <span>Aurel Ops</span>
        </NuxtLink>

        <div class="nav-label nav-space">Commercial</div>
        <NuxtLink to="/prospects" active-class="active">
          <i class="pi pi-users" /> <span>Prospects</span>
        </NuxtLink>
        <NuxtLink to="/pipeline" active-class="active">
          <i class="pi pi-chart-line" /> <span>Pipeline</span>
        </NuxtLink>
        <NuxtLink to="/campaigns" active-class="active">
          <i class="pi pi-envelope" /> <span>Campagnes</span>
        </NuxtLink>
        <NuxtLink to="/performance" active-class="active">
          <i class="pi pi-chart-bar" /> <span>Performance</span>
        </NuxtLink>

        <div class="nav-label nav-space">Intelligence</div>
        <NuxtLink to="/product-matcher" active-class="active">
          <i class="pi pi-sparkles" /> <span>Product Matcher</span>
        </NuxtLink>
        <NuxtLink to="/demo-personalizer" active-class="active">
          <i class="pi pi-images" /> <span>Demo Personalizer</span>
        </NuxtLink>
        <NuxtLink to="/product-markets" active-class="active">
          <i class="pi pi-globe" /> <span>Product Markets</span>
        </NuxtLink>

        <div class="nav-label nav-space">Système</div>
        <NuxtLink to="/journal" active-class="active">
          <i class="pi pi-list" /> <span>Journal</span>
        </NuxtLink>
        <NuxtLink to="/usage" active-class="active">
          <i class="pi pi-chart-bar" /> <span>Usage</span>
        </NuxtLink>
        <NuxtLink to="/settings" active-class="active">
          <i class="pi pi-cog" /> <span>Configuration</span>
        </NuxtLink>
      </nav>

      <div class="sidebar-foot">
        <div class="atelier-signature">
          <span class="atelier-dot" />
          <div>
            <strong>Atelys · Tahiti</strong>
            <span>Atelier numérique sur mesure</span>
          </div>
        </div>
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
  grid-template-columns: var(--mailer-sidebar-width, 272px) minmax(0, 1fr);
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
  background:
    radial-gradient(circle at 34% 4%, rgba(202, 129, 72, 0.13), transparent 15rem),
    linear-gradient(180deg, #190d18 0%, #24101f 48%, #120a12 100%);
  color: #f6efe7;
  padding: 1.2rem 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  border-right: 1px solid rgba(219, 158, 103, 0.14);
  box-shadow: 18px 0 50px rgba(47, 20, 36, 0.05);
  z-index: 20;
}

.brand {
  display: block;
  padding: 0.45rem 0.5rem 1rem;
  border-bottom: 1px solid rgba(219, 158, 103, 0.12);
}

.brand-logo {
  display: block;
  width: 100%;
  max-width: 218px;
  height: auto;
  object-fit: contain;
  object-position: left center;
  filter: saturate(0.96) contrast(1.03);
}

nav {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  flex: 1;
  padding: 0.1rem 0;
}

.nav-label {
  padding: 0.48rem 0.82rem 0.32rem;
  color: #b9a89d;
  font-size: 0.64rem;
  font-weight: 760;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.nav-space {
  margin-top: 0.5rem;
}

nav a {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.72rem;
  padding: 0.66rem 0.8rem;
  border-radius: 11px;
  color: #d8cec8;
  font-size: 0.88rem;
  transition:
    background 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease;
}

nav a i {
  width: 1.05rem;
  text-align: center;
  color: #9d8b81;
  font-size: 0.92rem;
  transition: color 0.16s ease;
}

nav a:hover {
  background: rgba(255, 248, 240, 0.055);
  color: #fff8f0;
  transform: translateX(2px);
}

nav a:hover i {
  color: #dca166;
}

nav a.active {
  background: linear-gradient(90deg, rgba(210, 138, 80, 0.16), rgba(210, 138, 80, 0.06));
  color: #fff8f0;
  font-weight: 680;
}

nav a.active::before {
  content: '';
  position: absolute;
  left: -0.86rem;
  top: 0.58rem;
  bottom: 0.58rem;
  width: 3px;
  border-radius: 999px;
  background: linear-gradient(180deg, #f0b273, #b86a3f);
  box-shadow: 0 0 15px rgba(222, 151, 91, 0.45);
}

nav a.active i {
  color: #e5a56a;
}

.sidebar-foot {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.9rem 0.2rem 0.1rem;
  border-top: 1px solid rgba(219, 158, 103, 0.11);
}

.atelier-signature {
  display: flex;
  gap: 0.58rem;
  align-items: center;
  padding: 0 0.5rem;
}

.atelier-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #d8955c;
  box-shadow: 0 0 14px rgba(216, 149, 92, 0.55);
}

.atelier-signature strong {
  display: block;
  font-size: 0.72rem;
  color: #efe5df;
}

.atelier-signature span:not(.atelier-dot) {
  display: block;
  margin-top: 0.14rem;
  font-size: 0.61rem;
  color: #86756d;
}

.sidebar-foot :deep(.p-button) {
  justify-content: flex-start;
  color: #917f76 !important;
}

.main {
  padding: 1.65rem 1.9rem 2.4rem;
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
    gap: 0.55rem;
    padding: 0.55rem 0.7rem;
    overflow-x: auto;
    overflow-y: hidden;
    border-right: none;
    border-bottom: 1px solid rgba(219, 158, 103, 0.14);
    z-index: 30;
  }

  .brand {
    border-bottom: none;
    padding: 0.1rem 0.4rem;
    flex-shrink: 0;
  }

  .brand-logo {
    width: 126px;
  }

  nav {
    flex-direction: row;
    flex: 1;
    gap: 0.18rem;
  }

  .nav-label {
    display: none;
  }

  nav a {
    white-space: nowrap;
    padding: 0.55rem 0.66rem;
  }

  nav a.active::before {
    display: none;
  }

  .sidebar-foot {
    display: none;
  }

  .main {
    padding: 1rem 0.85rem 1.6rem;
  }
}
</style>
