# Détection des réponses — Mailer

## Objectif

Dès qu'un prospect répond à un email de prospection, Mailer doit :

1. rattacher la réponse au prospect déjà contacté ;
2. enregistrer `replyDetectedAt` ;
3. faire passer `new/contacted` vers `replied` sans dégrader un statut commercial plus avancé ;
4. retirer de la file les relances déjà en attente ;
5. empêcher les étapes suivantes de repartir pour ce prospect.

Mailer ne stocke pas le corps du message entrant dans cette phase. Seuls l'adresse expéditrice, la date, l'objet et éventuellement le Message-ID sont conservés.

## Endpoint entrant

`POST /api/replies/inbound`

Header obligatoire :

`X-Reply-Webhook-Secret: <REPLY_WEBHOOK_SECRET>`

Exemple de corps JSON :

```json
{
  "fromEmail": "prospect@example.pf",
  "receivedAt": "2026-09-17T06:00:00Z",
  "subject": "Re: votre proposition",
  "messageId": "<unique-message-id>"
}
```

Le secret doit être défini côté serveur dans `.env.prod` et comporter au moins 24 caractères. Il ne doit jamais être placé dans le frontend.

## Raccordement Gmail recommandé pour Atelys

Les emails envoyés à `contact@atelys-digital.com` arrivent dans la boîte Gmail utilisée par Atelys. Le chemin le plus léger est donc le relais Google Apps Script fourni dans :

`integrations/gmail-reply-relay/Code.gs`

Le relais :

- cherche les messages adressés à l'adresse Atelys sur les 7 derniers jours ;
- ignore les messages déjà relayés grâce à leur identifiant Gmail ;
- n'envoie jamais le corps du message ;
- transmet uniquement `fromEmail`, `receivedAt`, `subject` et un `messageId` idempotent ;
- utilise `X-Reply-Webhook-Secret` ;
- peut tourner automatiquement toutes les 5 minutes.

### Installation

1. Dans `.env.prod` du serveur Mailer, définir un secret aléatoire d'au moins 24 caractères :

```env
REPLY_WEBHOOK_SECRET=<secret-long-et-aleatoire>
```

2. Créer un projet Google Apps Script dans le compte Gmail qui reçoit les messages Atelys.

3. Copier `integrations/gmail-reply-relay/Code.gs` dans le projet.

4. Dans **Project Settings → Script properties**, ajouter :

```text
MAILER_REPLY_WEBHOOK_URL = https://mailing.aito-flow.com/api/replies/inbound
MAILER_REPLY_WEBHOOK_SECRET = <le-meme-secret-que-sur-le-serveur>
ATELYS_REPLY_TO_ADDRESS = contact@atelys-digital.com
```

5. Exécuter `testAtelysReplyRelayConfig()` et autoriser les accès Gmail / requêtes externes demandés par Google. Le test doit retourner un HTTP 2xx. L'adresse de test est volontairement inexistante côté Mailer et ne doit modifier aucun prospect.

6. Exécuter une fois `installAtelysReplyRelay()`.

Cette fonction supprime un éventuel ancien trigger du même nom, crée un trigger toutes les 5 minutes puis lance une première synchronisation.

Pour arrêter l'intégration : `uninstallAtelysReplyRelay()`.

Pour remettre à zéro uniquement la mémoire locale des IDs déjà relayés : `resetAtelysReplyRelayCursor()`.

### Pourquoi ne pas stocker le corps des emails

L'objectif de cette intégration est uniquement de détecter qu'une réponse existe et d'arrêter les relances. Le contenu complet du message reste dans Gmail. Cela réduit les données copiées dans Mailer et évite d'introduire un stockage de conversations inutile à cette phase.

## Autres fournisseurs

L'endpoint reste indépendant de Gmail. Un mailserver, un webhook entrant, un service de messagerie ou une autre passerelle peut envoyer le même contrat JSON vers `/api/replies/inbound` avec le secret partagé.

## Correspondance

Mailer cherche le dernier envoi `sent` dont `toEmail` correspond à `fromEmail`, puis rattache la réponse au prospect de cet envoi. Un `messageId` identique au dernier message reçu est traité comme doublon.

## Garde-fous d'envoi

Les relances sont bloquées si :

- le prospect est désinscrit ;
- `replyDetectedAt` est renseigné ;
- le statut est `replied`, `interested`, `demo`, `meeting`, `quote`, `won` ou `lost`.

Le contrôle est exécuté à la création de la file puis à nouveau juste avant chaque envoi réel.
