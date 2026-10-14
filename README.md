# Argus — interface web

Interface de chat pour un agent Argus : l'utilisateur discute avec l'assistant,
consulte ses notifications, et installe le tout comme une **application** sur son
téléphone (PWA). HTML + CSS + JavaScript vanilla — **aucun framework, aucun build**.

## Ce que contient ce dépôt

```
index.html                 la page (panneau, chat, notifications, barre de saisie)
assets/style.css           les styles (palette en variables, mode sombre auto)
assets/app.js              la logique : chat, pièces jointes, voix, notifications
assets/*.png, *.svg        icônes de l'application
manifest.webmanifest       déclaration de l'application (nom, icônes, plein écran)
sw.js                      service worker : rend l'app installable, garde la coquille
serveur-ui.py              le serveur : sert l'interface et parle à l'agent
argus-ui                   le lanceur : démarre tout et affiche l'adresse
```

## Comment ça marche

```
Navigateur / application installée
        │
        ▼
   serveur-ui.py  (sur la machine)
        │
        ▼
   l'agent Argus  (dans son conteneur isolé)
```

Le serveur est le **seul** point de contact : l'agent n'est jamais exposé
directement. Les conversations sont conservées localement, dans `.etat/`
(jamais publié).

## Lancer

```bash
./argus-ui            # démarre tout et affiche l'adresse
./argus-ui --status   # où en est-on, quelle adresse
./argus-ui --stop     # arrêter
./argus-ui --local    # sans accès extérieur (réseau local seulement)
```

## Installer sur un téléphone

1. Ouvrir l'adresse affichée.
2. Menu du navigateur → **« Ajouter à l'écran d'accueil »**.

L'icône Argus apparaît alors comme une application : plein écran, sans barre
d'adresse.

> **L'adresse doit rester FIXE.** Une application installée est liée à son
> adresse : si elle change, l'installation ne fonctionne plus. On utilise
> `tailscale serve`, qui donne une adresse permanente — jamais un tunnel
> éphémère, dont l'adresse change à chaque redémarrage.

## Notifications

L'interface affiche les notifications de veille (nouvelles annonces, baisses de
prix, ventes, alertes) : un badge sur la cloche indique le nombre non lu, un
panneau les liste par catégorie. Elles sont lues dans un magasin partagé avec
l'agent — les deux voient les mêmes données.

## En cas de problème

| Symptôme | À vérifier |
|---|---|
| L'interface ne s'ouvre pas | le serveur tourne-t-il ? `./argus-ui --status` |
| Le chat ne répond pas | l'agent (conteneur) tourne-t-il ? |
| Une modification ne s'affiche pas | fermer complètement l'application et la rouvrir (cache) |

## Pour les développeurs

Après avoir modifié des fichiers servis par l'application, **incrémenter la
constante `CACHE` dans `sw.js`** (`argus-coquille-vN`) : sans cela, les
téléphones déjà installés gardent l'ancienne version indéfiniment.
