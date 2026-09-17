<script setup lang="ts">
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import type { Prospect } from '~/types/mailer'
import type { ProductRecommendation } from '~/types/product-matcher'
import type { DemoPreparation } from '~/types/demo-personalizer'

type DemoProspect = Prospect & {
  productRecommendation?: ProductRecommendation | null
  demoPreparation?: DemoPreparation | null
}

const { api } = useApi()
const toast = useToast()
const loading = ref(false)
const preparingId = ref<string | null>(null)
const prospects = ref<DemoProspect[]>([])
const activePack = ref<DemoPreparation | null>(null)
const dialogVisible = ref(false)

const eligible = computed(() =>
  prospects.value.filter((p) => {
    const state = p.productRecommendation?.reviewState
    return state === 'accepted' || state === 'overridden'
  }),
)

async function load() {
  loading.value = true
  try {
    prospects.value = await api<DemoProspect[]>('prospects', {
      query: { unsubscribed: 'false' },
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Demo Personalizer',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    loading.value = false
  }
}

async function prepare(p: DemoProspect) {
  preparingId.value = p.id
  try {
    const pack = await api<DemoPreparation>(`demo-personalizer/${p.id}/prepare`, {
      method: 'POST',
    })
    activePack.value = pack
    dialogVisible.value = true
    await load()
    toast.add({
      severity: 'success',
      summary: 'Pack démo prêt',
      detail: `${p.company} · ${pack.productName}`,
      life: 3000,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Préparation démo',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    preparingId.value = null
  }
}

function openPack(p: DemoProspect) {
  if (!p.demoPreparation) return
  activePack.value = p.demoPreparation
  dialogVisible.value = true
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Demo Personalizer</h1>
        <p>
          Prépare les données sûres utilisées pour personnaliser une démo. Aucune image n’est générée à cette étape.
        </p>
      </div>
      <Button icon="pi pi-refresh" text @click="load" />
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <DataTable :value="eligible" :loading="loading" data-key="id" striped-rows paginator :rows="15" size="small">
        <Column field="company" header="Entreprise" sortable />
        <Column header="Produit">
          <template #body="{ data }">
            <strong>{{ data.productRecommendation?.productName || '—' }}</strong>
          </template>
        </Column>
        <Column header="Confiance">
          <template #body="{ data }">
            <Tag
              v-if="data.productRecommendation"
              :value="data.productRecommendation.confidence"
              :severity="data.productRecommendation.confidence === 'high' ? 'success' : 'warn'"
            />
          </template>
        </Column>
        <Column header="Pack démo">
          <template #body="{ data }">
            <div class="row">
              <Tag
                v-if="data.demoPreparation"
                value="Préparé"
                severity="success"
              />
              <Tag v-else value="À préparer" severity="secondary" />
            </div>
          </template>
        </Column>
        <Column header="Artefact">
          <template #body="{ data }">
            <Tag
              v-if="data.demoPreparation?.artifactStatus === 'generated'"
              value="Généré"
              severity="success"
            />
            <Tag v-else value="Non généré" severity="secondary" />
          </template>
        </Column>
        <Column header="" style="width: 13rem">
          <template #body="{ data }">
            <div class="row">
              <Button
                label="Préparer"
                icon="pi pi-sparkles"
                size="small"
                :loading="preparingId === data.id"
                @click="prepare(data)"
              />
              <Button
                v-if="data.demoPreparation"
                icon="pi pi-eye"
                text
                rounded
                v-tooltip.top="'Voir le pack'"
                @click="openPack(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <div v-if="!loading && !eligible.length" class="card muted">
      Aucun prospect validé pour une démo. Validez d’abord une recommandation dans Product Matcher.
    </div>

    <Dialog
      v-model:visible="dialogVisible"
      modal
      header="Pack Demo Personalizer"
      style="width: min(760px, 96vw)"
    >
      <div v-if="activePack" class="stack">
        <div>
          <h2 style="margin: 0">{{ activePack.company }}</h2>
          <div class="row" style="margin-top: 0.4rem; flex-wrap: wrap">
            <Tag :value="activePack.productName" severity="info" />
            <Tag :value="activePack.demoType" severity="secondary" />
            <Tag value="Images non générées" severity="secondary" />
          </div>
        </div>

        <div class="card">
          <strong>Angle recommandé</strong>
          <p style="margin-bottom: 0">{{ activePack.recommendedAngle }}</p>
        </div>

        <div>
          <label class="field-label">Branding autorisé</label>
          <div class="card stack" style="gap: 0.3rem">
            <div><strong>Nom :</strong> {{ activePack.branding.name }}</div>
            <div><strong>Activité :</strong> {{ activePack.branding.activity || '—' }}</div>
            <div><strong>Zone :</strong> {{ activePack.branding.location || '—' }}</div>
            <div><strong>Site :</strong> {{ activePack.branding.website || '—' }}</div>
          </div>
        </div>

        <div>
          <label class="field-label">Faits autorisés dans la démo</label>
          <ul>
            <li v-for="fact in activePack.factsAllowed" :key="fact">{{ fact }}</li>
          </ul>
        </div>

        <div>
          <label class="field-label">Sources</label>
          <div class="stack" style="gap: 0.4rem">
            <div v-for="e in activePack.evidence" :key="`${e.source}-${e.fact}`" class="card" style="padding: 0.65rem">
              <div>{{ e.fact }}</div>
              <a v-if="e.source.startsWith('http')" :href="e.source" target="_blank" rel="noopener" class="muted">{{ e.source }}</a>
              <div v-else class="muted">{{ e.source }}</div>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  </div>
</template>
