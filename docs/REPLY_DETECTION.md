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

## Raccordement à la boîte de réception

L'endpoint est volontairement indépendant du fournisseur. Une règle/automation du fournisseur de réception (mailserver, webhook entrant, service de messagerie ou passerelle compatible) doit transmettre chaque email reçu à cet endpoint.

Le raccordement fournisseur est une étape de déploiement : le code Mailer sait déjà traiter l'événement, mais aucune réponse ne peut être détectée automatiquement tant qu'aucune boîte de réception ne pousse ses événements vers ce webhook.

## Correspondance

Mailer cherche le dernier envoi `sent` dont `toEmail` correspond à `fromEmail`, puis rattache la réponse au prospect de cet envoi. Un `messageId` identique au dernier message reçu est traité comme doublon.

## Garde-fous d'envoi

Les relances sont bloquées si :

- le prospect est désinscrit ;
- `replyDetectedAt` est renseigné ;
- le statut est `replied`, `interested`, `demo`, `meeting`, `quote`, `won` ou `lost`.

Le contrôle est exécuté à la création de la file puis à nouveau juste avant chaque envoi réel.
