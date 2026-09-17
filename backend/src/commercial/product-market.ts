import type { ProductCatalogEntry } from '../product-matcher/product-catalog';

export type MarketId = 'pf' | 'fr';
export type ProductId = ProductCatalogEntry['id'];

export type ProductMarketProfile = {
  productId: ProductId;
  productName: string;
  marketId: MarketId;
  marketName: string;
  currency: 'XPF' | 'EUR';
  defaultEnabled: boolean;
  defaultAutopilotEnabled: boolean;
  priceLabel: string | null;
  idealCustomers: string[];
  buyingSignals: string[];
  objections: string[];
  firstAction: string;
  demoRule: string;
};

const PF = 'Polynésie française';
const FR = 'France métropolitaine et outre-mer en EUR';

const PF_PROFILES: ProductMarketProfile[] = [
  {
    productId: 'mahana',
    productName: 'Mahana',
    marketId: 'pf',
    marketName: PF,
    currency: 'XPF',
    defaultEnabled: true,
    defaultAutopilotEnabled: true,
    priceLabel: '2 900 XPF / mois',
    idealCustomers: ['pensions', 'bungalows', 'petits hébergements touristiques'],
    buyingSignals: [
      'plusieurs unités à réserver',
      'réservations par téléphone, Messenger ou WhatsApp',
      'planning ou disponibilités gérés manuellement',
      'absence de moteur de réservation adapté',
    ],
    objections: ['déjà visible sur Booking/Airbnb', 'petite structure', 'peur de complexifier la gestion'],
    firstAction: 'Montrer le gain de temps sur réservations et disponibilités sans imposer une démo lourde.',
    demoRule: 'Démo réelle seulement après réponse positive, demande de fonctionnement ou engagement fort.',
  },
  {
    productId: 'roulibre',
    productName: 'Roulibre',
    marketId: 'pf',
    marketName: PF,
    currency: 'XPF',
    defaultEnabled: true,
    defaultAutopilotEnabled: true,
    priceLabel: '5 900 XPF / mois',
    idealCustomers: ['loueurs indépendants de voitures', 'loueurs de scooters', 'petites flottes touristiques'],
    buyingSignals: [
      'plusieurs véhicules',
      'réservations quotidiennes',
      'planning manuel',
      'paiement séparé de la réservation',
      'échanges clients par WhatsApp, Messenger ou téléphone',
    ],
    objections: ['déjà équipé', 'petite flotte', 'prix', 'habitude du papier ou de WhatsApp'],
    firstAction: 'Parler d’abord de disponibilité, planning et réservation, pas de technologie.',
    demoRule: 'Démo réelle après réponse, clic significatif ou demande explicite de voir le planning.',
  },
  {
    productId: 'kynexy',
    productName: 'Kynexy',
    marketId: 'pf',
    marketName: PF,
    currency: 'XPF',
    defaultEnabled: true,
    defaultAutopilotEnabled: true,
    priceLabel: '5 900 à 9 900 XPF / mois',
    idealCustomers: ['artisans terrain', 'entreprises avec équipes', 'maintenance', 'jardinage', 'piscine', 'climatisation'],
    buyingSignals: [
      'plusieurs salariés ou équipes',
      'interventions récurrentes',
      'planning partagé',
      'devis et factures dispersés',
      'double saisie terrain / administratif',
    ],
    objections: ['outil actuel suffisant', 'équipe peu numérique', 'peur de changer les habitudes'],
    firstAction: 'Identifier le coût de la double saisie et du manque de visibilité entre terrain et bureau.',
    demoRule: 'Démo complète seulement quand le prospect reconnaît un problème opérationnel ou demande à voir le système.',
  },
  {
    productId: 'devifact',
    productName: 'DeviFact',
    marketId: 'pf',
    marketName: PF,
    currency: 'XPF',
    defaultEnabled: true,
    defaultAutopilotEnabled: true,
    priceLabel: '990 XPF / mois',
    idealCustomers: ['artisans solo', 'indépendants', 'petites entreprises de service'],
    buyingSignals: ['devis fréquents', 'factures Word/Excel', 'besoin simple', 'administratif chronophage'],
    objections: ['je fais déjà mes factures', 'je ne veux pas un gros logiciel'],
    firstAction: 'Vendre la simplicité, le prix et le temps gagné. Éviter toute démo lourde.',
    demoRule: 'Un aperçu léger suffit dans la majorité des cas ; vraie démo uniquement sur demande.',
  },
  {
    productId: 'custom-atelys',
    productName: 'Atelys sur-mesure',
    marketId: 'pf',
    marketName: PF,
    currency: 'XPF',
    defaultEnabled: true,
    defaultAutopilotEnabled: true,
    priceLabel: 'Sur devis',
    idealCustomers: ['entreprises avec un processus métier spécifique non couvert par les produits Atelys'],
    buyingSignals: ['workflow manuel complexe', 'logiciel actuel inadapté', 'besoin métier précis', 'temps perdu mesurable'],
    objections: ['budget', 'délai', 'peur du sur-mesure'],
    firstAction: 'Faire préciser le problème métier et la valeur d’une solution avant de parler de réalisation.',
    demoRule: 'Pas de prototype coûteux sans problème confirmé et intérêt explicite.',
  },
];

const FR_PROFILES: ProductMarketProfile[] = PF_PROFILES.map((profile) => ({
  ...profile,
  marketId: 'fr' as const,
  marketName: FR,
  currency: 'EUR' as const,
  defaultEnabled: false,
  defaultAutopilotEnabled: false,
  priceLabel: null,
  firstAction: 'Marché verrouillé tant qu’une version EUR du produit et son offre commerciale ne sont pas validées.',
  demoRule: 'Aucune prospection ni démo tant que ce marché est désactivé.',
}));

export const PRODUCT_MARKET_PROFILES: ProductMarketProfile[] = [
  ...PF_PROFILES,
  ...FR_PROFILES,
];

export function getProductMarketProfile(productId: string, marketId: string) {
  return (
    PRODUCT_MARKET_PROFILES.find(
      (profile) => profile.productId === productId && profile.marketId === marketId,
    ) || null
  );
}
