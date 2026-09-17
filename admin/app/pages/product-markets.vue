<script setup lang="ts">
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'

const { api } = useApi()
const toast = useToast()

const loading = ref(true)
const savingId = ref<string | null>(null)

type ProductMarketState = {
  productId: string
  productName: string
  marketId: 'pf' | 'fr'
  marketName: string
  currency: 'XPF' | 'EUR'
  enabled: boolean
  autopilotEnabled: boolean
  effectivePriceLabel: string | null
  idealCustomers: string[]
  buyingSignals: string[]
  objections: string[]
  firstAction: string
  demoRule: string
}

const rows = ref<ProductMarketState[]>([])
const prices = reactive<Record<string, string>>({})

function rowKey(row: ProductMarketState) {
  return `${row.productId}:${row.marketId}`
}

async function load() {
  loading.value = true
  try {
    rows.value = await api<ProductMarketState[]>('commercial/product-markets')
    for (const row of rows.value) prices[rowKey(row)] = row.effectivePriceLabel || ''
  } finally {
    loading.value = false
  }
}

async function update(row: ProductMarketState, patch: Record<string, unknown>) {
  const key = rowKey(row)
  savingId.value = key
  try {
    const updated = await api<ProductMarketState>(
      `commercial/product-markets/${row.productId}/${row.marketId}`,
      { method: 'PUT', body: patch },
    )
    const index = rows.value.findIndex((item) => rowKey(item) === key)
    if (index >= 0) rows.value[index] = updated
    prices[key] = updated.effectivePriceLabel || ''
    toast.add({ severity: 'success', summary: 'Marché mis à jour', life: 1800 })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Erreur',
      detail: e instanceof Error ? e.message : String(e),
      life: 3500,
    })
  } finally {
    savingId.value = null
  }
}

function toggleMarket(row: ProductMarketState) {
  return update(row, { enabled: !row.enabled })
}

function toggleAutopilot(row: ProductMarketState) {
  return update(row, { autopilotEnabled: !row.autopilotEnabled })
}

function savePrice(row: ProductMarketState) {
  return update(row, { priceLabel: prices[rowKey(row)] || null })
}

const pfRows = computed(() => rows.value.filter((row) => row.marketId === 'pf'))
const frRows = computed(() => rows.value.filter((row) => row.marketId === 'fr'))

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Product Market Switch</h1>
        <p>Un produit n'est prospecté que sur un marché où son offre commerciale est prête.</p>
      </div>
      <Button label="Actualiser" icon="pi pi-refresh" text :loading="loading" @click="load" />
    </div>

    <div class="card stack" style="margin-bottom: 1rem">
      <div class="row" style="justify-content: space-between; gap: 1rem; flex-wrap: wrap">
        <div>
          <h2 style="margin: 0 0 0.35rem; font-size: 1.08rem">Polynésie française · XPF</h2>
          <p class="muted" style="margin: 0">Phase commerciale active. Aurel Radar et Autopilot peuvent utiliser ces offres.</p>
        </div>
        <Tag value="MARCHÉ ACTIF" severity="success" />
      </div>

      <div class="market-grid">
        <div v-for="row in pfRows" :key="rowKey(row)" class="market-card">
          <div class="row" style="justify-content: space-between; align-items: flex-start; gap: 0.75rem">
            <div>
              <h3>{{ row.productName }}</h3>
              <div class="row" style="gap: 0.4rem; flex-wrap: wrap">
                <Tag :value="row.enabled ? 'Vente active' : 'Vente coupée'" :severity="row.enabled ? 'success' : 'secondary'" />
                <Tag
                  :value="row.autopilotEnabled && row.enabled ? 'Autopilot actif' : 'Autopilot coupé'"
                  :severity="row.autopilotEnabled && row.enabled ? 'info' : 'secondary'"
                />
              </div>
            </div>
            <strong>{{ row.currency }}</strong>
          </div>

          <div class="stack compact">
            <label>Prix / offre</label>
            <div class="row" style="gap: 0.45rem">
              <InputText v-model="prices[rowKey(row)]" style="flex: 1" />
              <Button
                icon="pi pi-save"
                text
                :loading="savingId === rowKey(row)"
                @click="savePrice(row)"
              />
            </div>
          </div>

          <div class="mini-section">
            <strong>Client idéal</strong>
            <span>{{ row.idealCustomers.join(' · ') }}</span>
          </div>
          <div class="mini-section">
            <strong>Signaux d'achat</strong>
            <span>{{ row.buyingSignals.join(' · ') }}</span>
          </div>
          <div class="mini-section">
            <strong>Première action</strong>
            <span>{{ row.firstAction }}</span>
          </div>
          <div class="mini-section">
            <strong>Règle démo</strong>
            <span>{{ row.demoRule }}</span>
          </div>

          <div class="row" style="gap: 0.5rem; flex-wrap: wrap">
            <Button
              :label="row.enabled ? 'Couper ce marché' : 'Activer ce marché'"
              :severity="row.enabled ? 'secondary' : 'success'"
              size="small"
              :loading="savingId === rowKey(row)"
              @click="toggleMarket(row)"
            />
            <Button
              :label="row.autopilotEnabled ? 'Couper Autopilot' : 'Activer Autopilot'"
              :disabled="!row.enabled"
              outlined
              size="small"
              :loading="savingId === rowKey(row)"
              @click="toggleAutopilot(row)"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="card stack">
      <div class="row" style="justify-content: space-between; gap: 1rem; flex-wrap: wrap">
        <div>
          <h2 style="margin: 0 0 0.35rem; font-size: 1.08rem">France · EUR</h2>
          <p class="muted" style="margin: 0">Verrouillée tant que les versions EUR, prix et offres ne sont pas prêts.</p>
        </div>
        <Tag value="VERROUILLÉ PAR DÉFAUT" severity="warn" />
      </div>

      <div class="market-grid">
        <div v-for="row in frRows" :key="rowKey(row)" class="market-card locked">
          <div class="row" style="justify-content: space-between; gap: 0.75rem">
            <strong>{{ row.productName }}</strong>
            <Tag :value="row.enabled ? 'Activé' : 'Non prêt'" :severity="row.enabled ? 'success' : 'secondary'" />
          </div>
          <p class="muted" style="margin: 0">{{ row.firstAction }}</p>
          <div class="stack compact">
            <label>Prix / offre EUR</label>
            <InputText v-model="prices[rowKey(row)]" placeholder="À définir avant activation" />
          </div>
          <div class="row" style="gap: 0.5rem; flex-wrap: wrap">
            <Button
              label="Enregistrer l'offre"
              size="small"
              text
              :loading="savingId === rowKey(row)"
              @click="savePrice(row)"
            />
            <Button
              :label="row.enabled ? 'Désactiver France' : 'Activer France'"
              size="small"
              :severity="row.enabled ? 'secondary' : 'warn'"
              :loading="savingId === rowKey(row)"
              @click="toggleMarket(row)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 0.9rem;
}
.market-card {
  border: 1px solid var(--p-content-border-color, #e5e7eb);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  background: var(--p-content-background, #fff);
}
.market-card h3 {
  margin: 0 0 0.45rem;
  font-size: 1rem;
}
.market-card.locked {
  opacity: 0.9;
}
.compact {
  gap: 0.35rem;
}
.compact label,
.mini-section strong {
  font-size: 0.78rem;
  color: var(--p-text-muted-color, #64748b);
}
.mini-section {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.86rem;
  line-height: 1.4;
}
</style>
