# Mailer — Mini-Brevo + OpenAI

Dashboard de prospection email : enrichissement web, rédaction OpenAI, envoi batch, tracking ouvertures / clics / désinscription.

**Prod :** https://mailing.aito-flow.com  
**Repo :** https://github.com/Oldwo1f/mailer (privé)

## Stack

| Dossier | Rôle |
| --- | --- |
| `backend/` | NestJS 11 + TypeORM + SQLite |
| `admin/` | Nuxt 4 + PrimeVue Aura (dashboard, port 3002 en local) |
| `mailserver/` | Relais SMTP (`POST /api/send`) |

Pas encore d’auth admin : traiter la prod comme un outil interne.

## Collaboration (Alexis + Adrien)

1. Travailler sur une **branche**, jamais directement sur `main`.
2. Ouvrir une **pull request** vers `main`.
3. La **CI** (tests backend + builds Nest/Nuxt) doit passer.
4. Au **merge dans `main`**, GitHub Actions déploie tout seul sur le VPS (`mailing.aito-flow.com`).

Les secrets (`.env`, `.env.prod`) ne sont **jamais** dans Git. En prod ils restent uniquement sur le serveur.

## Démarrage local

Prérequis : Node 22, npm.

```bash
git clone git@github.com:Oldwo1f/mailer.git
cd mailer
cp .env.example .env
# renseigner au minimum OPENAI_API_KEY (et un provider mail / MAILSERVER_*)

cd backend && npm install
cd ../admin && npm install
```

Deux terminaux :

```bash
cd backend && npm run start:dev   # API http://localhost:3001
cd admin && npm run dev           # Dashboard http://localhost:3002
```

Tracking public : `{PUBLIC_URL}/t/o/:token.gif`, `/t/c/:token?u=…`, `/u/:token`.  
Les pixels d’ouverture ne marchent que si `PUBLIC_URL` est joignable depuis Internet.

## Parcours produit

1. **Réglages** — clés OpenAI + search, URL mailserver, identités From  
2. **Prospects** — listes, import JSON, découverte web, enrichissement  
3. **Campagnes** — brief → générer → éditer → envoyer  
4. **Stats** — ouvertures / clics / unsub  

## Git — commandes utiles

```bash
git checkout main
git pull
git checkout -b feat/mon-changement
# …commits…
git push -u origin feat/mon-changement
gh pr create --fill
```

Après merge, le déploiement part tout seul. Pour relancer à la main : onglet Actions → **CI / CD** → **Run workflow**.

Déploiement manuel depuis une machine qui a le SSH VPS :

```bash
./scripts/deploy-to-prod.sh
```

## Production

Traefik sur le VPS `185.211.4.81`, réseau Docker `n8n_default`.  
SQLite vit dans un volume Docker : un deploy **ne wipe pas** les données.

```bash
# Sur le serveur uniquement
ssh root@185.211.4.81
cd /var/www/mailer && ./scripts/deploy.sh
```
