export type ProductCatalogEntry = {
  id: 'mahana' | 'roulibre' | 'kynexy' | 'devifact' | 'custom-atelys';
  name: string;
  targetActivities: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  commercialAngles: string[];
  demoTemplate: string;
  productUrl: string;
};

const CREATIONS_URL = 'https://atelys-digital.com/creations';

export const PRODUCT_CATALOG: ProductCatalogEntry[] = [
  {
    id: 'mahana',
    name: 'Mahana',
    targetActivities: [
      'hotel',
      'hôtel',
      'pension',
      'bungalow',
      'hébergement',
      'hebergement',
      'guesthouse',
      'maison d hôtes',
      "maison d'hôtes",
      'location saisonnière',
      'location saisonniere',
      'vacation rental',
    ],
    positiveSignals: [
      'réservation',
      'reservation',
      'disponibilité',
      'disponibilite',
      'planning',
      'booking',
      'nuitée',
      'nuitee',
      'chambre',
      'bungalow',
    ],
    negativeSignals: ['location voiture', 'location scooter', 'artisan'],
    commercialAngles: [
      'Centraliser réservations et disponibilités',
      'Réduire les échanges manuels autour des séjours',
    ],
    demoTemplate: 'mahana-personalized-images',
    productUrl: CREATIONS_URL,
  },
  {
    id: 'roulibre',
    name: 'Roulibre',
    targetActivities: [
      'location voiture',
      'location de voiture',
      'location auto',
      'rent a car',
      'car rental',
      'location scooter',
      'location de scooter',
      'location moto',
      'location quad',
      'location véhicule',
      'location vehicule',
    ],
    positiveSignals: [
      'véhicule',
      'vehicule',
      'flotte',
      'réservation',
      'reservation',
      'planning',
      'disponibilité',
      'disponibilite',
      'caution',
    ],
    negativeSignals: ['pension', 'hotel', 'hôtel', 'bungalow'],
    commercialAngles: [
      'Centraliser flotte, disponibilités et réservations',
      'Réduire la gestion manuelle des locations',
    ],
    demoTemplate: 'roulibre-personalized-images',
    productUrl: CREATIONS_URL,
  },
  {
    id: 'kynexy',
    name: 'Kynexy',
    targetActivities: [
      'jardin',
      'paysag',
      'plomb',
      'chauffag',
      'climatisation',
      'clim',
      'électric',
      'electric',
      'piscin',
      'élag',
      'elag',
      'maintenance',
      'technicien',
      'artisan terrain',
      'intervention',
    ],
    positiveSignals: [
      'chantier',
      'intervention',
      'équipe',
      'equipe',
      'planning',
      'terrain',
      'technicien',
      'devis',
      'facture',
      'facturation',
      'client',
    ],
    negativeSignals: ['hotel', 'hôtel', 'pension', 'location voiture'],
    commercialAngles: [
      'Centraliser planning, clients, interventions et documents',
      'Réduire la double saisie entre terrain et administratif',
    ],
    demoTemplate: 'kynexy-personalized-images',
    productUrl: CREATIONS_URL,
  },
  {
    id: 'devifact',
    name: 'DeviFact',
    targetActivities: [
      'artisan',
      'indépendant',
      'independant',
      'prestataire',
      'service',
      'entrepreneur',
    ],
    positiveSignals: [
      'devis',
      'facture',
      'facturation',
      'planning',
      'client',
      'administratif',
    ],
    negativeSignals: [
      'équipe',
      'equipe',
      'technicien',
      'intervention terrain',
      'multi équipe',
      'multi-equipe',
      'flotte',
    ],
    commercialAngles: [
      'Simplifier devis, factures et suivi client',
      'Donner un outil léger aux petites structures de service',
    ],
    demoTemplate: 'devifact-personalized-images',
    productUrl: CREATIONS_URL,
  },
  {
    id: 'custom-atelys',
    name: 'Atelys sur-mesure',
    targetActivities: [],
    positiveSignals: [],
    negativeSignals: [],
    commercialAngles: [
      'Partir du processus réel de l’entreprise avant de proposer un outil',
    ],
    demoTemplate: 'custom-discovery',
    productUrl: 'https://atelys-digital.com/decouverte',
  },
];

export function getProduct(productId: string) {
  return PRODUCT_CATALOG.find((p) => p.id === productId) ?? null;
}
