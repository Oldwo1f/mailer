<script setup lang="ts">
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import type { Prospect } from '~/types/mailer'
import type {
  ProductCatalogItem,
  ProductRecommendation,
  ProductReviewState,
} from '~/types/product-matcher'

type MatchedProspect = Prospect & {
  productRecommendation?: ProductRecommendation | null
}

const { api } = useApi()
const toast = useToast()

const prospects = ref<MatchedProspect[]>([])
const catalog = ref<ProductCatalogItem[]>([])
const selected = ref<MatchedProspect[]>([])
const loading = ref(false)
const matching = ref(false)
const filter = ref('')
const reviewVisible = ref(false)
const activeProspect = ref<MatchedProspect | null>(null)
const overrideProductId = ref<string | null>(null)
const reviewNote = ref('')

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return prospects.value
  return prospects.value.filter((p) => {
    const recommendation = p.productRecommendation
    return (
      p.company.toLowerCase().includes(q) ||
      (p.profile?.type || '').toLowerCase().includes(q) ||
      (p.enrichment?.activity || '').toLowerCase().includes(q) ||
      (recommendation?.productName || '').toLowerCase().includes(q)
    )
  })
})

const productOptions = computed(() =>
  catalog.value.map((p) => ({ label: p.name, value: p.id })),
)

async function load() {
  loading.value = true
  try {
    ;[prospects.value, catalog.value] = await Promise.all([
      api<MatchedProspect[]>('prospects', { query: { unsubscribed: 'false' } }),
      api<ProductCatalogItem[]>('prospects/product-catalog'),
    ])
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Product Matcher',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    loading.value = false
  }
}

async function matchOne(p: MatchedProspect) {
  matching.value = true
  try {
    await api(`prospects/${p.id}/match-product`, { method: 'POST' })
    await load()
    toast.add({
      severity: 'success',
      summary: 'Produit analysé',
      detail: p.company,
      life: 2500,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Matching',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    matching.value = false
  }
}

async function matchSelected() {
  if (!selected.value.length) return
  matching.value = true
  try {
    const results = await api<Array<{ id: string; ok: boolean; error?: string }>>(
      'prospects/match-products',
      {
        method: 'POST',
        body: { ids: selected.value.map((p) => p.id) },
      },
    )
    const ok = results.filter((r) => r.ok).length
    await load()
    selected.value = []
    toast.add({
      severity: ok === results.length ? 'success' : 'warn',
      summary: 'Product Matcher',
      detail: `${ok}/${results.length} recommandation(s) calculée(s)`,
      life: 4000,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Matching',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    matching.value = false
  }
}

function openReview(p: MatchedProspect) {
  if (!p.productRecommendation) return
  activeProspect.value = p
  overrideProductId.value = p.productRecommendation.productId
  reviewNote.value = p.productRecommendation.reviewNote || ''
  reviewVisible.value = true
}

async function review(state: ProductReviewState) {
  const prospect = activeProspect.value
  if (!prospect?.productRecommendation) return
  if (state === 'overridden' && !overrideProductId.value) {
    toast.add({ severity: 'warn', summary: 'Choisissez un produit', life: 3000 })
    return
  }

  try {
    await api(`prospects/${prospect.id}/product-recommendation`, {
      method: 'PATCH',
      body: {
        reviewState: state,
        productId: state === 'overridden' ? overrideProductId.value : undefined,
        note: reviewNote.value.trim() || null,
      },
    })
    reviewVisible.value = false
    await load()
    toast.add({ severity: 'success', summary: 'Décision enregistrée', life: 2500 })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Revue',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  }
}

function confidenceSeverity(value?: string) {
  if (value === 'high') return 'success'
  if (value === 'medium') return 'warn'
  return 'secondary'
}

function reviewSeverity(value?: string) {
  if (value === 'accepted' || value === 'overridden') return 'success'
  if (value === 'rejected') return 'danger'
  return 'secondary'
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Product Matcher Atelys</h1>
        <p>Associe chaque prospect au produit Atelys le plus cohérent, avec score et preuves.</p>
      </div>
      <div class="row">
        <Button
          label="Matcher la sélection"
          icon="pi pi-sparkles"
          :disabled="!selected.length"
          :loading="matching"
          @click="matchSelected"
        />
        <Button icon="pi pi-refresh" text @click="load" />
      </div>
    </div>

    <div class="card">
      <InputText v-model="filter" placeholder="Rechercher entreprise, activité ou produit…" style="width: min(480px, 100%)" />
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <DataTable
        v-model:selection="selected"
        :value="filtered"
        :loading="loading"
        data-key="id"
        paginator
        :rows="15"
        striped-rows
        size="small"
      >
        <Column selection-mode="multiple" header-style="width: 3rem" />
        <Column field="company" header="Entreprise" sortable />
        <Column header="Activité">
          <template #body="{ data }">
            <div class="stack" style="gap: 0.1rem">
              <span>{{ data.enrichment?.activity || data.profile?.type || '—' }}</span>
              <span v-if="data.profile?.commune" class="muted">{{ data.profile.commune }}</span>
            </div>
          </template>
        </Column>
        <Column header="Produit recommandé">
          <template #body="{ data }">
            <div v-if="data.productRecommendation" class="stack" style="gap: 0.2rem">
              <strong>{{ data.productRecommendation.productName }}</strong>
              <span class="muted" style="font-size: 0.78rem">
                {{ data.productRecommendation.reasons?.[0] || 'Analyse disponible' }}
              </span>
            </div>
            <span v-else class="muted">Non analysé</span>
          </template>
        </Column>
        <Column header="Score" style="width: 6rem">
          <template #body="{ data }">
            <strong v-if="data.productRecommendation">{{ data.productRecommendation.score }}/100</strong>
            <span v-else>—</span>
          </template>
        </Column>
        <Column header="Confiance" style="width: 8rem">
          <template #body="{ data }">
            <Tag
              v-if="data.productRecommendation"
              :value="data.productRecommendation.confidence"
              :severity="confidenceSeverity(data.productRecommendation.confidence)"
            />
            <span v-else>—</span>
          </template>
        </Column>
        <Column header="Revue" style="width: 9rem">
          <template #body="{ data }">
            <Tag
              v-if="data.productRecommendation"
              :value="data.productRecommendation.reviewState"
              :severity="reviewSeverity(data.productRecommendation.reviewState)"
            />
            <span v-else>—</span>
          </template>
        </Column>
        <Column header="" style="width: 9rem">
          <template #body="{ data }">
            <div class="row">
              <Button
                icon="pi pi-sparkles"
                text
                rounded
                :loading="matching"
                v-tooltip.top="'Calculer / recalculer'"
                @click="matchOne(data)"
              />
              <Button
                v-if="data.productRecommendation"
                icon="pi pi-eye"
                text
                rounded
                v-tooltip.top="'Voir et valider'"
                @click="openReview(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog
      v-model:visible="reviewVisible"
      modal
      header="Recommandation produit"
      style="width: min(760px, 96vw)"
    >
      <div v-if="activeProspect?.productRecommendation" class="stack">
        <div>
          <h2 style="margin: 0 0 0.25rem">{{ activeProspect.company }}</h2>
          <div class="row" style="flex-wrap: wrap">
            <Tag :value="activeProspect.productRecommendation.productName" severity="info" />
            <Tag :value="`${activeProspect.productRecommendation.score}/100`" />
            <Tag
              :value="activeProspect.productRecommendation.confidence"
              :severity="confidenceSeverity(activeProspect.productRecommendation.confidence)"
            />
          </div>
        </div>

        <div>
          <label class="field-label">Pourquoi</label>
          <ul style="margin-top: 0.4rem">
            <li v-for="reason in activeProspect.productRecommendation.reasons" :key="reason">{{ reason }}</li>
          </ul>
        </div>

        <div>
          <label class="field-label">Preuves utilisées</label>
          <div class="stack" style="gap: 0.45rem">
            <div
              v-for="evidence in activeProspect.productRecommendation.evidence"
              :key="`${evidence.source}-${evidence.fact}`"
              class="card"
              style="padding: 0.65rem 0.8rem"
            >
              <div>{{ evidence.fact }}</div>
              <a
                v-if="evidence.source.startsWith('http')"
                :href="evidence.source"
                target="_blank"
                rel="noopener"
                class="muted"
                style="font-size: 0.75rem"
              >{{ evidence.source }}</a>
              <div v-else class="muted" style="font-size: 0.75rem">{{ evidence.source }}</div>
            </div>
            <span v-if="!activeProspect.productRecommendation.evidence.length" class="muted">Pas assez de preuve structurée.</span>
          </div>
        </div>

        <div v-if="activeProspect.productRecommendation.painPoints.length">
          <label class="field-label">Opportunités explicites</label>
          <ul style="margin-top: 0.4rem">
            <li v-for="pain in activeProspect.productRecommendation.painPoints" :key="pain">{{ pain }}</li>
          </ul>
        </div>

        <div>
          <label class="field-label">Angle commercial</label>
          <p style="margin-top: 0.35rem">{{ activeProspect.productRecommendation.recommendedAngle }}</p>
        </div>

        <div class="form-grid">
          <div>
            <label class="field-label">Remplacer par</label>
            <Select
              v-model="overrideProductId"
              :options="productOptions"
              option-label="label"
              option-value="value"
              style="width: 100%"
            />
          </div>
          <div>
            <label class="field-label">Note de revue</label>
            <Textarea v-model="reviewNote" rows="3" style="width: 100%" />
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Rejeter" severity="danger" outlined @click="review('rejected')" />
        <Button label="Forcer ce produit" severity="secondary" @click="review('overridden')" />
        <Button label="Accepter" icon="pi pi-check" @click="review('accepted')" />
      </template>
    </Dialog>
  </div>
</template>
