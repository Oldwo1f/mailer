<script setup lang="ts">
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import type { Campaign } from '~/types/mailer'
import { emailTypeLabel } from '~/constants/campaign'

const { api } = useApi()
const toast = useToast()
const confirm = useConfirm()
const campaigns = ref<Campaign[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    campaigns.value = await api<Campaign[]>('campaigns')
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

function statusSeverity(s: string) {
  const map: Record<string, string> = {
    draft: 'secondary',
    generating: 'info',
    review: 'warn',
    sending: 'info',
    waiting: 'warn',
    sent: 'success',
    failed: 'danger',
  }
  return map[s] || 'secondary'
}

function remove(c: Campaign) {
  confirm.require({
    message: `Supprimer la campagne « ${c.name} » ?`,
    header: 'Confirmation',
    icon: 'pi pi-exclamation-triangle',
    accept: async () => {
      await api(`campaigns/${c.id}`, { method: 'DELETE' })
      await load()
    },
  })
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Campagnes</h1>
        <p>Brief → séquence d’emails → génération IA → envoi</p>
      </div>
      <NuxtLink to="/campaigns/new">
        <Button label="Nouvelle campagne" icon="pi pi-plus" />
      </NuxtLink>
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <DataTable :value="campaigns" :loading="loading" striped-rows size="small">
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
        <Column field="tone" header="Ton" />
        <Column header="Type">
          <template #body="{ data }">
            {{ emailTypeLabel(data.emailType) }}
          </template>
        </Column>
        <Column header="Expéditeur">
          <template #body="{ data }">
            {{ data.sender ? `${data.sender.name}` : '—' }}
          </template>
        </Column>
        <Column field="createdAt" header="Créée">
          <template #body="{ data }">
            {{ new Date(data.createdAt).toLocaleString('fr-FR') }}
          </template>
        </Column>
        <Column header="" style="width: 5rem">
          <template #body="{ data }">
            <Button icon="pi pi-trash" text rounded severity="danger" @click="remove(data)" />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>
