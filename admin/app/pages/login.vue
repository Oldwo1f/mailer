<script setup lang="ts">
import Button from 'primevue/button'
import Password from 'primevue/password'

const { api } = useApi()
const router = useRouter()
const toast = useToast()

const password = ref('')
const loading = ref(false)

async function submit() {
  if (password.value.length < 8) {
    toast.add({
      severity: 'warn',
      summary: 'Mot de passe requis',
      detail: 'Saisissez le mot de passe administrateur.',
      life: 3000,
    })
    return
  }

  loading.value = true
  try {
    await api<{ ok: boolean }>('auth/login', {
      method: 'POST',
      body: { password: password.value },
    })
    password.value = ''
    await router.push('/')
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Connexion refusée',
      detail: e instanceof Error ? e.message : String(e),
      life: 4000,
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <form class="login-card" @submit.prevent="submit">
      <div class="login-icon"><i class="pi pi-shield" /></div>
      <div>
        <h1>Mailer</h1>
        <p>Accès administrateur Atelys</p>
      </div>

      <div class="field">
        <label for="admin-password">Mot de passe</label>
        <Password
          id="admin-password"
          v-model="password"
          :feedback="false"
          toggle-mask
          fluid
          autocomplete="current-password"
          autofocus
        />
      </div>

      <Button
        type="submit"
        label="Se connecter"
        icon="pi pi-lock-open"
        :loading="loading"
        :disabled="password.length < 8"
      />
    </form>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background:
    radial-gradient(circle at top, rgba(45, 212, 191, 0.12), transparent 34rem),
    #0b1220;
}

.login-card {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
  padding: 2rem;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
}

.login-card h1 {
  margin: 0;
  font-size: 1.6rem;
}

.login-card p {
  margin: 0.25rem 0 0;
  color: #64748b;
}

.login-icon {
  width: 3rem;
  height: 3rem;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: #ccfbf1;
  color: #0f766e;
  font-size: 1.25rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.field label {
  font-size: 0.88rem;
  font-weight: 600;
  color: #334155;
}
</style>
