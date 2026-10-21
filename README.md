# Mahjong entre amis

Mahjong à quatre en ligne, pensé pour le téléphone tenu en paysage, avec deux règles au choix :
**Hong Kong** (rapide et convivial) et **MCR** (règles de compétition chinoises, 81 combinaisons, 8 points minimum).
On crée une table, on envoie le code ou le lien, chacun joue depuis son navigateur. Les places vides peuvent être prises par des bots.

## Démarrer

Il faut Node 20 ou plus récent.

```bash
npm install
npm run dev        # serveur de jeu (port 3000) + application (http://localhost:5173), sur Windows comme sur Mac
```

Pour essayer depuis un téléphone sur le même Wi-Fi, ouvrez `http://<ip-de-votre-ordinateur>:5173`.
La table 3D seule, avec une main de démonstration, est sur `http://localhost:5173/proto.html` (développement uniquement).

En production, on construit l'application puis on lance un seul serveur qui sert les pages et le WebSocket :

```bash
npm run build
npm start          # http://localhost:3000  (variable PORT pour changer de port)
```

## Ce qui est en place

- **Deux règles** : Hong Kong (fans minimum réglables, barème « demi-épicé ») et MCR (les 81 combinaisons avec leurs exclusions,
  mains spéciales dont les tuiles tissées, 8 points sans les fleurs, paiements 8 + valeur, donneur qui change à chaque main).
- **Tables privées** avec code de 4 lettres et lien de partage ; l'hôte choisit la règle, règle la partie et ajoute des bots.
- **Bots** pour les deux règles. En MCR, ils construisent leur main autour d'un objectif qui vaut 8 points (dragons, suites
  identiques, couleurs, sept paires, tuiles tissées…).
- **Reconnexion** : un joueur qui perd la connexion est joué par un bot et retrouve sa place en revenant (même après rechargement).
- **Table en vraie 3D (WebGL)** : tuiles d'un seul bloc aux bords arrondis, défausses tournées vers leur joueur, mains des
  adversaires debout, votre main debout devant vous (on touche pour lever, on touche encore pour jeter), animations de jeu et de prise.
- **Tutoriels pas à pas** pour chaque règle, avec exercices et partie d'essai contre 3 bots ; règles et liste des combinaisons dans le jeu.
- **Aide de jeu** (bouton en bas à droite) : les combinaisons à viser avec leurs valeurs, « Pour ma main » qui lit votre main et montre les objectifs les plus proches avec les tuiles qui manquent, et l'essentiel des règles. Point vert sur les tuiles qui vous mettent en attente.
- Annonces animées, sons synthétisés, vibration à votre tour, réactions, écran de résultat détaillé, podium, installable sur l'écran d'accueil.

## Organisation du code

```
packages/engine/       les règles, sans dépendance : partagé par le serveur et l'application
  src/tiles.ts         les 144 tuiles, tri, noms
  src/hand.ts          formes gagnantes (dont les tuiles tissées), attentes, shanten
  src/scoring.ts       fans de Hong Kong et barème
  src/mcr.ts           les 81 combinaisons MCR et leurs règles de cumul
  src/targets.ts       objectifs à portée pour l'aide « Pour ma main »
  src/rules.ts         ce qui change d'une règle à l'autre (calcul, minimum, paiements, donneur)
  src/game.ts          déroulement d'une partie ; aucune horloge : l'hôte appelle timeout()
  src/bot.ts           bot de Hong Kong ; src/botMcr.ts : bot MCR
  src/types.ts         types partagés, dont la vue d'un joueur et le protocole WebSocket
  test/                règles HK et MCR, parties complètes entre bots, statistiques
apps/server/           Node + ws : tables avec code, hôte, bots, reconnexion, minuteries
apps/client/           React + Vite : accueil, salon, table, résultats, règles, tutoriels
  src/three/           la table 3D (Three.js) : scène, tuiles, animations, caméra
  src/table/Table.tsx  l'écran de jeu : scène 3D en fond, plaques, boutons et annonces par-dessus
  src/tutorial/        un tutoriel par règle (hk.tsx, mcr.tsx)
```

Le serveur fait autorité : il garde le mur et les mains, et n'envoie à chaque joueur que ce qu'il a le droit de voir.

## Tests

```bash
npm test                         # règles HK et MCR + parties complètes entre bots
npm run typecheck
npm run simulate -- 20 mcr       # statistiques sur 20 parties de bots (hk ou mcr)
npx tsx apps/server/test/online.ts ws://localhost:3000/ws mcr   # 4 clients en ligne, serveur lancé
```

## Mettre en ligne

Un seul processus Node suffit : il sert l'application et le WebSocket sur le même port.

### Avec Render (gratuit, le plus simple)

1. Mettez le projet sur GitHub (un dépôt privé convient).
2. Sur [render.com](https://render.com), créez un compte, puis **New > Blueprint** et choisissez le dépôt.
   Le fichier `render.yaml` configure tout : construction, démarrage, contrôle de santé.
3. Une fois le déploiement terminé, Render donne une adresse en `https://….onrender.com` : envoyez-la à vos amis.

Sur l'offre gratuite, le serveur s'endort après 15 minutes sans visite : la première ouverture prend alors une minute environ.

### Avec Docker (Fly.io, Railway, un petit serveur…)

```bash
docker build -t mahjong .
docker run -p 3000:3000 mahjong
```

### Bon à savoir

- Les tables vivent en mémoire : un redémarrage efface les parties en cours. Gardez une seule instance.
- Contrôle de santé : `/health`.
- Derrière un proxy (Nginx…), autorisez la mise à niveau WebSocket sur `/ws`.

## Vers une application mobile

L'application est une page web React autonome : elle peut être emballée telle quelle avec
[Capacitor](https://capacitorjs.com) pour iOS et Android. Il faudra alors pointer la connexion WebSocket
(`apps/client/src/lib/store.ts`, fonction `connect`) vers l'adresse publique du serveur au lieu de `location.host`,
et verrouiller l'orientation en paysage dans la configuration native.
