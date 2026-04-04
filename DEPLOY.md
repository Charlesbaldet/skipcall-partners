# 🚀 Skipcall - Guide de Déploiement

## Architecture du projet

```
skipcall-referrals/
├── backend/                 # API Node.js + Express
│   ├── db/                  # Schema SQL, migrations, seed
│   ├── routes/              # Auth, Referrals, Partners, Commissions, Dashboard
│   ├── middleware/           # JWT auth, role-based access
│   ├── services/            # Email notifications
│   ├── server.js            # Point d'entrée
│   ├── Dockerfile
│   └── .env.example
├── frontend/                # React + Vite
│   └── src/
│       ├── pages/           # Login, Dashboard, Pipeline, Commissions, Partners
│       ├── components/      # Layout, Navigation
│       ├── hooks/           # Auth context
│       └── lib/             # API client, constants
├── docker-compose.yml       # Dev local en 1 commande
└── DEPLOY.md                # Ce fichier
```

---

## Option 1 : Lancement local avec Docker (5 min)

### Prérequis
- Docker & Docker Compose installés

### Étapes

```bash
# 1. Cloner le repo
git clone <votre-repo> && cd skipcall-referrals

# 2. Lancer PostgreSQL + API
docker-compose up -d

# 3. Initialiser la base et les données de test
docker-compose exec api node db/seed.js

# 4. Lancer le frontend
cd frontend && npm install && npm run dev
```

Accédez à **http://localhost:5173**

### Comptes de test
| Rôle | Email | Mot de passe |
|------|-------|-------------|
| Admin | admin@skipcall.com | skipcall2026! |
| Commercial | commercial@skipcall.com | commercial2026! |
| Partenaire | marc@techalliance.fr | partner2026! |
| Partenaire | sophie@digiconseil.fr | partner2026! |
| Partenaire | julien@cloudexperts.io | partner2026! |

---

## Option 2 : Déploiement Production (recommandé)

### Stack recommandé (gratuit au départ)
- **Frontend** : Vercel (gratuit)
- **Backend** : Railway ou Render (gratuit jusqu'à certains seuils)
- **Base de données** : Railway PostgreSQL ou Neon (gratuit)

### Étape 1 : Base de données

#### Option A — Railway
1. Créez un compte sur [railway.app](https://railway.app)
2. Nouveau projet → Add PostgreSQL
3. Copiez la `DATABASE_URL` depuis l'onglet Variables

#### Option B — Neon (serverless, gratuit)
1. Créez un compte sur [neon.tech](https://neon.tech)
2. Créez un projet → Copiez la connection string

#### Initialiser le schema
```bash
# Avec la DATABASE_URL de production
DATABASE_URL="postgresql://..." node backend/db/init.js
DATABASE_URL="postgresql://..." node backend/db/seed.js
```

### Étape 2 : Backend API

#### Déployer sur Railway
1. Connectez votre repo GitHub à Railway
2. Railway détecte automatiquement le Dockerfile dans `/backend`
3. Ajoutez les variables d'environnement :

```
DATABASE_URL=<votre_url_postgresql>
JWT_SECRET=<générez_avec: openssl rand -hex 32>
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://votre-app.vercel.app
NODE_ENV=production
```

4. (Optionnel) Pour les emails, ajoutez :
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre-email@gmail.com
SMTP_PASS=votre-mot-de-passe-application
EMAIL_FROM="Skipcall <notifications@skipcall.com>"
```

> **Note Gmail** : Activez les "App Passwords" dans votre compte Google
> pour générer un mot de passe dédié.

#### Déployer sur Render
1. New Web Service → Connectez votre repo
2. Root directory : `backend`
3. Build : `npm install`
4. Start : `node server.js`
5. Ajoutez les mêmes variables d'environnement

### Étape 3 : Frontend

#### Déployer sur Vercel
```bash
# 1. Installez Vercel CLI
npm i -g vercel

# 2. Depuis le dossier frontend/
cd frontend
vercel
```

Ou connectez directement votre repo GitHub sur [vercel.com](https://vercel.com) :
1. Import project → sélectionnez votre repo
2. Root directory : `frontend`
3. Framework : Vite
4. Variables d'environnement :
```
VITE_API_URL=https://votre-api.railway.app/api
```

**Important** : Mettez à jour `frontend/src/lib/api.js` pour utiliser la variable :
```javascript
const API_BASE = import.meta.env.VITE_API_URL || '/api';
```

---

## Option 3 : VPS (DigitalOcean, OVH, Hetzner)

Si vous préférez tout gérer sur un serveur :

```bash
# Sur votre VPS (Ubuntu 22+)

# 1. Installez Docker
curl -fsSL https://get.docker.com | sh

# 2. Clonez le projet
git clone <repo> && cd skipcall-referrals

# 3. Créez le .env backend
cp backend/.env.example backend/.env
# Éditez avec vos valeurs de production

# 4. Lancez tout
docker-compose -f docker-compose.yml up -d

# 5. Configurez un reverse proxy (Nginx + Certbot pour HTTPS)
sudo apt install nginx certbot python3-certbot-nginx
```

Exemple de config Nginx :
```nginx
server {
    server_name app.skipcall.com;
    
    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location / {
        root /var/www/skipcall-frontend/dist;
        try_files $uri /index.html;
    }
}
```

---

## Configuration des emails

Pour activer les notifications (nouveau referral, changement de statut, deal gagné) :

### Gmail
1. Activez la 2FA sur votre compte Google
2. Allez dans Sécurité → Mots de passe des applications
3. Générez un mot de passe pour "Mail"
4. Utilisez ce mot de passe dans `SMTP_PASS`

### Autre fournisseur (OVH, SendGrid, Mailgun)
Adaptez `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` selon la doc du fournisseur.

---

## Sécurité en production

Avant de mettre en ligne, vérifiez :

- [ ] `JWT_SECRET` est une chaîne aléatoire d'au moins 64 caractères
- [ ] `NODE_ENV=production`
- [ ] Les mots de passe par défaut ont été changés
- [ ] HTTPS est activé (Vercel le fait automatiquement, sinon Certbot)
- [ ] Le `FRONTEND_URL` dans le backend correspond à l'URL réelle
- [ ] La base PostgreSQL est en accès restreint (pas d'IP publique ouverte)

---

## Fonctionnalités livrées

### Espace Partenaire
- ✅ Connexion sécurisée par rôle
- ✅ Formulaire de soumission de recommandation (multi-étapes)
- ✅ Niveau de recommandation (Chaud / Tiède / Froid)
- ✅ Suivi de ses propres recommandations
- ✅ Notifications email sur changement de statut

### Espace Interne (Admin + Commerciaux)
- ✅ Dashboard avec KPIs et graphiques avancés (Recharts)
- ✅ Pipeline complet : Nouveau → Contacté → RDV → Proposition → Gagné/Perdu
- ✅ Gestion des deals (valeur, statut, assignation)
- ✅ Historique d'activité par deal
- ✅ Tableau de commissions par partenaire
- ✅ Workflow commissions : En attente → Approuvée → Payée
- ✅ Gestion des partenaires (création, taux de commission)
- ✅ Classement des top partenaires
- ✅ Notifications email sur nouvelles recommandations

---

## Support

Des questions ? Besoin d'ajustements ? Revenez me voir sur Claude, je serai là pour vous aider à itérer.
