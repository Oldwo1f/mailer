import type { DemoRecipe } from './demo-personalizer.types';

export const DEMO_RECIPES: DemoRecipe[] = [
  {
    productId: 'mahana',
    productName: 'Mahana',
    demoType: 'mahana-personalized-images',
    targetScreenCount: 5,
    screens: [
      {
        id: 'overview',
        title: 'Vue d’ensemble',
        purpose: 'Projeter le prospect dans son activité avec son nom et son hébergement.',
        personalization: ['company', 'activity', 'location'],
      },
      {
        id: 'planning',
        title: 'Planning des réservations',
        purpose: 'Montrer une vue planning adaptée à une pension, un bungalow ou un hébergement.',
        personalization: ['company', 'factsAllowed'],
      },
      {
        id: 'reservation',
        title: 'Fiche réservation',
        purpose: 'Illustrer le suivi d’une réservation avec des données de démonstration clairement fictives.',
        personalization: ['company'],
      },
      {
        id: 'availability',
        title: 'Disponibilités',
        purpose: 'Montrer la centralisation des disponibilités sans inventer de capacité réelle.',
        personalization: ['company', 'factsAllowed'],
      },
      {
        id: 'public-view',
        title: 'Vue client',
        purpose: 'Aider le prospect à visualiser l’expérience côté client sans annoncer de fonctionnalité absente.',
        personalization: ['company', 'website'],
      },
    ],
  },
  {
    productId: 'roulibre',
    productName: 'Roulibre',
    demoType: 'roulibre-personalized-images',
    targetScreenCount: 5,
    screens: [
      {
        id: 'overview',
        title: 'Vue d’ensemble',
        purpose: 'Présenter l’activité de location avec le nom de l’entreprise.',
        personalization: ['company', 'activity', 'location'],
      },
      {
        id: 'fleet-planning',
        title: 'Planning véhicules',
        purpose: 'Montrer un planning de flotte et disponibilités avec véhicules de démonstration.',
        personalization: ['company', 'factsAllowed'],
      },
      {
        id: 'booking',
        title: 'Réservation',
        purpose: 'Illustrer une réservation sans inventer les vrais tarifs ou modèles du prospect.',
        personalization: ['company'],
      },
      {
        id: 'vehicle',
        title: 'Fiche véhicule',
        purpose: 'Visualiser la gestion d’un véhicule avec données de démonstration.',
        personalization: ['company'],
      },
      {
        id: 'customer-view',
        title: 'Vue client',
        purpose: 'Projeter le prospect dans un parcours de réservation côté client.',
        personalization: ['company', 'website'],
      },
    ],
  },
  {
    productId: 'kynexy',
    productName: 'Kynexy',
    demoType: 'kynexy-personalized-images',
    targetScreenCount: 6,
    screens: [
      {
        id: 'overview',
        title: 'Centre de contrôle',
        purpose: 'Présenter Kynexy comme centre de pilotage de l’activité terrain.',
        personalization: ['company', 'activity', 'location'],
      },
      {
        id: 'planning',
        title: 'Planning interventions',
        purpose: 'Montrer un planning adapté à l’activité du prospect avec données fictives.',
        personalization: ['company', 'factsAllowed'],
      },
      {
        id: 'contact',
        title: 'Fiche client',
        purpose: 'Illustrer la centralisation d’un client et de son historique.',
        personalization: ['company'],
      },
      {
        id: 'job',
        title: 'Intervention terrain',
        purpose: 'Illustrer le suivi d’une intervention ou d’un chantier.',
        personalization: ['company', 'activity'],
      },
      {
        id: 'quote',
        title: 'Devis',
        purpose: 'Montrer un devis d’exemple sans inventer de prix réel du prospect.',
        personalization: ['company'],
      },
      {
        id: 'invoice',
        title: 'Facture',
        purpose: 'Montrer le passage vers la facturation avec montants de démonstration.',
        personalization: ['company'],
      },
    ],
  },
  {
    productId: 'devifact',
    productName: 'DeviFact',
    demoType: 'devifact-personalized-images',
    targetScreenCount: 5,
    screens: [
      {
        id: 'overview',
        title: 'Vue d’ensemble',
        purpose: 'Présenter un outil léger adapté à la petite structure.',
        personalization: ['company', 'activity'],
      },
      {
        id: 'planning',
        title: 'Planning',
        purpose: 'Montrer l’organisation simple des rendez-vous et tâches.',
        personalization: ['company'],
      },
      {
        id: 'customer',
        title: 'Fiche client',
        purpose: 'Illustrer le suivi client avec données fictives.',
        personalization: ['company'],
      },
      {
        id: 'quote',
        title: 'Devis',
        purpose: 'Montrer la création d’un devis avec valeurs de démonstration.',
        personalization: ['company'],
      },
      {
        id: 'invoice',
        title: 'Facture',
        purpose: 'Montrer la facturation sans utiliser de données financières réelles non vérifiées.',
        personalization: ['company'],
      },
    ],
  },
  {
    productId: 'custom-atelys',
    productName: 'Atelys sur-mesure',
    demoType: 'custom-discovery',
    targetScreenCount: 0,
    screens: [],
  },
];

export function getDemoRecipe(productId: string) {
  return DEMO_RECIPES.find((recipe) => recipe.productId === productId) ?? null;
}
