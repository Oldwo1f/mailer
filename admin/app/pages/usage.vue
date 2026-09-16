<script setup lang="ts">
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import ProgressBar from 'primevue/progressbar'
import type { UsageItem, UsageSnapshot } from '~/types/mailer'

const { api } = useApi()
const toast = useToast()

const usage = ref<UsageSnapshot | null>(null)
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    usage.value = await api<UsageSnapshot>('usage')
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

function periodShort(p: UsageItem['period']) {
  if (p === 'daily') return 'j'
  if (p === 'monthly') return 'm'
  if (p === 'pool') return 'pool'
  return '∞'
}

function periodTag(p: UsageItem['period']) {
  if (p === 'daily') return 'Journalier'
  if (p === 'monthly') return 'Mensuel'
  if (p === 'pool') return 'Pool free'
  return 'Illimité'
}

function pct(item: UsageItem) {
  if (item.limit == null || item.limit <= 0) return 0
  return Math.min(100, Math.round((item.used / item.limit) * 1000) / 10)
}

function statusSeverity(item: UsageItem) {
  if (!item.configured) return 'secondary'
  if (item.exhausted) return 'danger'
  if (item.period === 'unlimited') return 'success'
  if (item.limit != null && item.used / item.limit >= 0.85) return 'warn'
  return 'success'
}

function statusLabel(item: UsageItem) {
  if (!item.configured) return 'off'
  if (item.exhausted) return 'épuisé'
  if (item.period === 'unlimited') return 'illimité'
  return 'OK'
}

function usageLabel(item: UsageItem) {
  if (!item.configured) return '—'
  if (item.period === 'unlimited') return 'illimité'
  if (item.limit == null) return String(item.used)
  return `${item.used} / ${item.limit}`
}

const mailToday = computed(() => {
  if (!usage.value) return 0
  return usage.value.mail.items
    .filter((i) => i.period === 'daily' && i.configured)
    .reduce((s, i) => s + i.used, 0)
})

const searchToday = computed(() => {
  if (!usage.value) return 0
  return usage.value.search.items
    .filter((i) => i.period === 'daily' && i.configured)
    .reduce((s, i) => s + i.used, 0)
})

const availableServices = computed(() => {
  if (!usage.value) return 0
  const all = [...usage.value.mail.items, ...usage.value.search.items]
  return all.filter((i) => i.configured && !i.exhausted).length
})

function nextLabel(kind: 'mail' | 'search') {
  const id =
    kind === 'mail'
      ? usage.value?.mail.nextProvider
      : usage.value?.search.nextProvider
  if (!id) return 'Aucun (quotas épuisés)'
  const items =
    kind === 'mail' ? usage.value?.mail.items : usage.value?.search.items
  return items?.find((i) => i.id === id)?.label || id
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Usage</h1>
        <p>Consommation des free tiers — priorités journalières puis mensuelles (UTC)</p>
      </div>
      <Button label="Actualiser" icon="pi pi-refresh" text :loading="loading" @click="load" />
    </div>

    <div class="kpi-grid">
      <div class="kpi">
        <div class="label">Emails (quotas jour)</div>
        <div class="value">{{ loading ? '—' : mailToday }}</div>
      </div>
      <div class="kpi">
        <div class="label">Recherches (quotas jour)</div>
        <div class="value">{{ loading ? '—' : searchToday }}</div>
      </div>
      <div class="kpi">
        <div class="label">Services dispo</div>
        <div class="value">{{ loading ? '—' : availableServices }}</div>
      </div>
    </div>

    <div class="card stack">
      <div class="page-header" style="margin-bottom: 0.25rem">
        <h2 style="margin: 0; font-size: 1.05rem">Email</h2>
        <Tag
          :value="usage?.mail.mode === 'auto' ? 'Mode auto' : `Verrouillé · ${usage?.mail.lockedProvider}`"
          :severity="usage?.mail.mode === 'auto' ? 'info' : 'warn'"
        />
      </div>
      <p class="muted" style="margin: 0">
        Prochain envoi → <strong>{{ nextLabel('mail') }}</strong>
      </p>
      <div class="usage-list">
        <div
          v-for="item in usage?.mail.items || []"
          :key="`mail-${item.id}`"
          class="usage-row"
          :class="{ dim: !item.configured }"
        >
          <div class="usage-head">
            <div class="usage-title">
              <strong>{{ item.label }}</strong>
              <Tag :value="periodTag(item.period)" severity="secondary" />
              <Tag :value="statusLabel(item)" :severity="statusSeverity(item)" />
            </div>
            <span class="mono">{{ usageLabel(item) }} {{ item.period !== 'unlimited' && item.configured ? periodShort(item.period) : '' }}</span>
          </div>
          <ProgressBar
            v-if="item.configured && item.limit != null"
            :value="pct(item)"
            :show-value="false"
            style="height: 0.55rem"
          />
          <div class="muted" style="font-size: 0.8rem">{{ item.resetLabel }}</div>
        </div>
      </div>
    </div>

    <div class="card stack">
      <div class="page-header" style="margin-bottom: 0.25rem">
        <h2 style="margin: 0; font-size: 1.05rem">Recherche web</h2>
      </div>
      <p class="muted" style="margin: 0">
        Prochaine recherche → <strong>{{ nextLabel('search') }}</strong>
        <span class="muted"> · Firecrawl hors rotation (scrape)</span>
      </p>
      <div class="usage-list">
        <div
          v-for="item in usage?.search.items || []"
          :key="`search-${item.id}`"
          class="usage-row"
          :class="{ dim: !item.configured }"
        >
          <div class="usage-head">
            <div class="usage-title">
              <strong>{{ item.label }}</strong>
              <Tag :value="periodTag(item.period)" severity="secondary" />
              <Tag :value="statusLabel(item)" :severity="statusSeverity(item)" />
              <Tag v-if="item.id === 'firecrawl'" value="scrape" severity="info" />
            </div>
            <span class="mono">{{ usageLabel(item) }} {{ item.period !== 'unlimited' && item.configured ? periodShort(item.period) : '' }}</span>
          </div>
          <ProgressBar
            v-if="item.configured && item.limit != null"
            :value="pct(item)"
            :show-value="false"
            style="height: 0.55rem"
          />
          <div class="muted" style="font-size: 0.8rem">{{ item.resetLabel }}</div>
        </div>
      </div>
    </div>

    <p v-if="usage" class="muted" style="font-size: 0.8rem; margin: 0">
      Snapshot {{ new Date(usage.generatedAt).toLocaleString('fr-FR') }} · timezone {{ usage.timezone }}
    </p>
  </div>
</template>

<style scoped>
.usage-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 0.75rem;
}

.usage-row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.usage-row.dim {
  opacity: 0.55;
}

.usage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.usage-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
</style>
