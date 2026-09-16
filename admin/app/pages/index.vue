<script setup lang="ts">
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import type { OverviewStats } from '~/types/mailer'

const { api } = useApi()
const toast = useToast()
const stats = ref<OverviewStats | null>(null)
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    stats.value = await api<OverviewStats>('stats/overview')
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Erreur',
      detail: e instanceof Error ? e.message : String(e),
      life: 4000,
    })
  } finally {
    loading.value = false
  }
}

onMounted(load)

function pct(n: number) {
  return `${Math.round(n * 1000) / 10}%`
}

function statusSeverity(s: string) {
  const map: Record<string, string> = {
    draft: 'secondary',
    generating: 'info',
    review: 'warn',
    sending: 'info',
    sent: 'success',
    failed: 'danger',
  }
  return map[s] || 'secondary'
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Tableau de bord</h1>
        <p>Prospection email — enrichissement, génération IA, envoi & tracking</p>
      </div>
      <div class="row">
        <Button label="Actualiser" icon="pi pi-refresh" text @click="load" :loading="loading" />
        <NuxtLink to="/campaigns/new">
          <Button label="Nouvelle campagne" icon="pi pi-plus" />
        </NuxtLink>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi">
        <div class="label">Prospects</div>
        <div class="value">{{ stats?.prospects ?? '—' }}</div>
      </div>
      <div class="kpi">
        <div class="label">Emails envoyés</div>
        <div class="value">{{ stats?.sent ?? '—' }}</div>
      </div>
      <div class="kpi">
        <div class="label">Ouvertures</div>
        <div class="value">{{ stats?.opened ?? '—' }}</div>
        <div class="muted" v-if="stats">{{ pct(stats.openRate) }}</div>
      </div>
      <div class="kpi">
        <div class="label">Clics</div>
        <div class="value">{{ stats?.clicks ?? '—' }}</div>
      </div>
      <div class="kpi">
        <div class="label">Désinscriptions</div>
        <div class="value">{{ stats?.unsubscribed ?? '—' }}</div>
      </div>
      <div class="kpi">
        <div class="label">Campagnes</div>
        <div class="value">{{ stats?.campaigns ?? '—' }}</div>
      </div>
    </div>

    <div class="card">
      <div class="page-header" style="margin-bottom: 1rem">
        <h2 style="margin: 0; font-size: 1.1rem">Dernières campagnes</h2>
        <NuxtLink to="/campaigns"><Button label="Tout voir" text size="small" /></NuxtLink>
      </div>
      <DataTable
        :value="stats?.recentCampaigns || []"
        :loading="loading"
        size="small"
        striped-rows
      >
        <Column field="name" header="Nom">
          <template #body="{ data }">
            <NuxtLink :to="`/campaigns/${data.id}`" style="color: #0f766e; font-weight: 600">
              {{ data.name }}
            </NuxtLink>
          </template>
        </Column>
        <Column field="status" header="Statut">
          <template #body="{ data }">
            <Tag :value="data.status" :severity="statusSeverity(data.status)" />
          </template>
        </Column>
        <Column header="Expéditeur">
          <template #body="{ data }">
            {{ data.sender ? `${data.sender.name} <${data.sender.email}>` : '—' }}
          </template>
        </Column>
        <Column field="createdAt" header="Créée">
          <template #body="{ data }">
            {{ new Date(data.createdAt).toLocaleString('fr-FR') }}
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>
