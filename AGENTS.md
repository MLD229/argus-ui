# AGENTS.md — instructions pour un agent IA

> Ce fichier est destiné à un agent IA (Claude Code, Cursor, Copilot, Codex,
> ou tout autre) qui aide un utilisateur **non technique** à installer ce
> logiciel sur son ordinateur. Lisez-le en entier avant d'agir.

## Votre rôle

L'utilisateur veut utiliser Argus. Il ne connaît pas le terminal. **Vous faites
le travail, il ne fait que répondre à vos questions.**

- Ne lui montrez **jamais** de sortie brute, de log, ni de commande.
- Dites-lui **ce que vous faites** et **ce que ça donne**, en français simple.
- Une question à la fois. Une étape à la fois.
- Si une étape échoue : arrêtez-vous, expliquez le problème simplement, proposez
  une solution. N'enchaînez pas sur la suite.

## Ce que vous installez

| Dépôt | Rôle | Visibilité |
|---|---|---|
| `MLD229/argus-cerveau` | les savoir-faire de l'agent (à installer avec Hermes) | public |
| `MLD229/argus-ui` | la page web + l'application pour téléphone | public |

## Ordre d'installation (ne pas inverser)

1. **Hermes Agent** — le logiciel qui fait tourner l'agent.
   - Windows (PowerShell) : `irm https://hermes-agent.nousresearch.com/install.ps1 | iex`
   - macOS / Linux : `curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash`
   - **Vérifier** : `hermes --version` renvoie un numéro. Sinon → faire rouvrir
     le terminal (le chemin doit être rechargé).

2. **Le cerveau**
   ```bash
   git clone https://github.com/MLD229/argus-cerveau.git
   cd argus-cerveau && ./installer-tout.sh
   ```
   - **Vérifier** : `./installer-tout.sh --check` ne doit afficher aucun `MANQUANT`.
   - **Piège** : les profils s'installent préfixés `argus-`. Sans le préfixe,
     un profil local portant le même nom serait écrasé.

3. **La clé d'API** — demandez-la à l'utilisateur (elle commence par `sk-`).
   ```bash
   echo 'DEEPSEEK_API_KEY=sk-LA-CLE' > ~/.hermes/.env
   chmod 600 ~/.hermes/.env
   for p in argus-chef argus-veille argus-client argus-serveur; do
     cp ~/.hermes/.env ~/.hermes/profiles/$p/.env 2>/dev/null || true
   done
   ```
   - **Vérifier** : `hermes -p argus-chef -z "dis juste: pret"` répond sans
     message d'identifiants manquants.
   - **Ne jamais** mettre la clé dans un dépôt ni dans un fichier partagé.

4. **L'interface**
   ```bash
   git clone https://github.com/MLD229/argus-ui.git
   cd argus-ui && ./argus-ui --local
   ```
   - **Vérifier** : `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/sante`
     → `200`.
   - Puis envoyer un message depuis l'interface : l'agent doit répondre.

5. **L'adresse permanente** (pour l'application téléphone)
   ```bash
   tailscale up
   tailscale serve --bg --https=443 http://127.0.0.1:8080
   tailscale serve status     # affiche l'adresse https://…ts.net
   ```
   - **Ne PAS** utiliser de tunnel éphémère (cloudflare, ngrok) : leur adresse
     change à chaque redémarrage, ce qui casse l'application installée.

6. **Téléphone** — dites à l'utilisateur d'installer Tailscale, de se connecter
   au même compte, d'ouvrir l'adresse, puis « Ajouter à l'écran d'accueil ».

## Règles de sécurité

- **Ne déduisez jamais une clé d'API** : demandez-la.
- **N'écrivez pas de secret dans un dépôt Git.**
- Si l'utilisateur demande quelque chose qui casserait l'accès existant
  (changer l'adresse, le port), **prévenez-le d'abord** : une application déjà
  installée sur un téléphone est liée à son adresse.
- Ne supprimez aucune donnée (conversations, mémoire) sans demande explicite.

## À la fin, rendez compte

- l'adresse à ouvrir ;
- les étapes réussies ;
- toute étape en échec, avec le message exact.

## Pour piloter l'installation ensuite

Une fois tout installé, un profil dédié prend le relais : **`argus-serveur`**.

```bash
hermes -p argus-serveur -z "où en est le serveur ?"
hermes -p argus-serveur -z "installe l'interface"
```

Il sait installer, vérifier, réparer, et poser les tâches de surveillance.
Faites-le lui faire plutôt que de répéter ces étapes.
