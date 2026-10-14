# Installer Argus sur un ordinateur neuf

> Ce guide part d'un ordinateur **vierge** (aucun outil installé) et va jusqu'à
> l'application installée sur le téléphone. Suivez les étapes dans l'ordre.
>
> **Pour un agent IA** (Claude Code, Cursor, Copilot…) : voir la section
> « Version pour agent » à la fin — elle est faite pour être lue et exécutée
> étape par étape, avec vérification à chaque étape.

---

## BON À SAVOIR AVANT DE COMMENCER

Trois choses à rassembler d'abord :

1. **Une clé d'API DeepSeek** — c'est le « moteur » qui fait réfléchir l'agent.
   Sans elle, l'agent s'affiche mais ne répond pas. Elle se crée sur
   `platform.deepseek.com` (compte, puis « API keys »). Elle ressemble à
   `sk-...`. Elle est **payante à l'usage**, mais quelques euros suffisent
   largement pour un usage normal.
2. **Un compte Tailscale** (gratuit) — c'est ce qui donne une adresse
   **permanente** pour installer l'application sur le téléphone.
3. **Le mot de passe administrateur** de l'ordinateur (une étape l'exige).

Comptez **15 à 20 minutes**.

---

## ÉTAPE 1 — Installer Hermes Agent

Hermes est le logiciel qui fait tourner l'agent. Il s'installe en une commande.

**Windows** (dans PowerShell) :

```powershell
irm https://hermes-agent.nousresearch.com/install.ps1 | iex
```

**macOS / Linux** (dans le terminal) :

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

**Vérifier** : fermez puis rouvrez le terminal, et tapez :

```bash
hermes --version
```

Vous devez voir un numéro de version. Si la commande n'est pas trouvée :
rouvrez le terminal (le programme a besoin de recharger le chemin).

---

## ÉTAPE 2 — Installer le cerveau Argus

Le « cerveau » contient les savoir-faire de l'agent (recherche de biens,
estimation, analyse de quartier, notifications…).

```bash
git clone https://github.com/MLD229/argus-cerveau.git
cd argus-cerveau
./installer-tout.sh
```

> Le clone utilise **https** (pas besoin de compte GitHub ni de clé SSH).
> Si `git` n'est pas installé : Windows → « Git for Windows » ; macOS → `xcode-select --install` ;
> Linux → `sudo apt install git` (ou l'équivalent).

**Vérifier** :

```bash
./installer-tout.sh --check
```

Vous devez voir `OK` pour les profils. Si vous voyez `MANQUANT`, relancez
`./installer-tout.sh`.

---

## ÉTAPE 3 — Donner la clé d'API à l'agent

L'agent a besoin de la clé DeepSeek. Elle ne se met **jamais** dans un dépôt.

```bash
# remplacer sk-VOTRE-CLE par la vraie clé
echo 'DEEPSEEK_API_KEY=sk-VOTRE-CLE' > ~/.hermes/.env
chmod 600 ~/.hermes/.env
```

Sous Windows (PowerShell) :

```powershell
'DEEPSEEK_API_KEY=sk-VOTRE-CLE' | Out-File -Encoding utf8 "$HOME\.hermes\.env"
```

**Vérifier** que l'agent répond vraiment :

```bash
hermes -p argus-chef -z "dis juste: pret"
```

Il doit répondre quelque chose. S'il parle d'identifiants manquants : la clé
n'a pas été lue, reprenez cette étape.

---

## ÉTAPE 4 — Installer l'interface

C'est la page web (et l'application pour téléphone).

```bash
cd ~
git clone https://github.com/MLD229/argus-ui.git
cd argus-ui
./argus-ui --local          # démarre et vérifie, en réseau local seulement
```

**Vérifier** : ouvrez `http://127.0.0.1:8080` dans un navigateur sur
l'ordinateur. L'interface doit s'afficher. Envoyez un message : l'agent doit
répondre (c'est la preuve que les étapes 2 et 3 sont bonnes).

---

## ÉTAPE 5 — Donner une adresse permanente

C'est cette étape qui permet d'installer l'application sur le téléphone **et
qu'elle continue de marcher dans le temps**.

```bash
# installer Tailscale (une fois) puis se connecter
tailscale up
```

Puis :

```bash
tailscale serve --bg --https=443 http://127.0.0.1:8080
tailscale serve status
```

La dernière commande affiche une adresse du type
`https://<nom-machine>.<votre-reseau>.ts.net`. **C'est votre adresse** : elle ne
change plus.

> **Pourquoi pas un tunnel classique ?** Un tunnel gratuit change d'adresse à
> chaque redémarrage. Une application installée sur un téléphone est liée à son
> adresse : elle cesserait de fonctionner. Tailscale donne une adresse fixe.

---

## ÉTAPE 6 — Installer l'application sur le téléphone

1. Installer l'application **Tailscale** sur le téléphone et s'y connecter avec
   **le même compte**.
2. Ouvrir l'adresse fixe obtenue à l'étape 5 dans le navigateur du téléphone.
3. Menu du navigateur → **« Ajouter à l'écran d'accueil »**.

L'icône Argus apparaît. Elle s'ouvre en plein écran, comme une application.
L'adresse ne change jamais : l'icône continuera de fonctionner.

---

## SI QUELQUE CHOSE NE VA PAS

| Symptôme | Cause probable | À faire |
|---|---|---|
| `hermes` introuvable | le terminal n'a pas rechargé | fermer/rouvrir le terminal |
| L'agent répond « pas d'identifiants » | clé d'API absente ou mal placée | reprendre l'étape 3 |
| L'interface ne s'ouvre pas | le serveur ne tourne pas | `cd ~/argus-ui && ./argus-ui --status` |
| Le chat tourne mais ne répond jamais | l'agent ne peut pas joindre le service | vérifier la clé, et la connexion internet |
| L'adresse change tout le temps | un tunnel éphémère a été utilisé | refaire l'étape 5 (Tailscale) |
| Sur le téléphone : « site inaccessible » | Tailscale pas connecté sur le téléphone | ouvrir l'application Tailscale et se connecter |
| Une modification ne s'affiche pas | cache de l'application | fermer complètement l'appli, la rouvrir |

---

## VERSION POUR AGENT (installation guidée, avec vérifications)

> Cette section est écrite pour être **exécutée** par un agent IA sur la machine
> du client. Chaque étape a une **vérification** : ne passez à la suivante que
> si la vérification passe. En cas d'échec, arrêtez et signalez précisément.

**Règle générale** : l'utilisateur est non technique. Ne lui montrez pas de
sortie brute ; dites ce que vous faites et le résultat. Si une étape exige des
droits administrateur, demandez-le.

### Étape A — Hermes
- **Faire** : installer Hermes (voir étape 1 selon l'OS).
- **Vérifier** : `hermes --version` renvoie un numéro de version.
- **Si échec** : le chemin n'est pas rechargé → demander de rouvrir le terminal.

### Étape B — Le cerveau
- **Faire** : `git clone https://github.com/MLD229/argus-cerveau.git` puis
  `./installer-tout.sh`.
- **Vérifier** : `./installer-tout.sh --check` → aucun `MANQUANT`.
- **Attention** : les profils s'installent avec le préfixe `argus-`. Sans lui,
  un profil local du même nom serait écrasé.

### Étape C — Clé d'API
- **Demander à l'utilisateur** sa clé DeepSeek (elle commence par `sk-`).
- **Faire** : l'écrire dans `~/.hermes/.env` (droits `600`), jamais dans un dépôt.
- **Vérifier** : `hermes -p argus-chef -z "dis juste: pret"` renvoie une réponse
  non vide et sans message d'identifiants manquants.

### Étape D — Interface
- **Faire** : `git clone https://github.com/MLD229/argus-ui.git` puis
  `./argus-ui --local`.
- **Vérifier** : `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/sante`
  → `200`.
- **Vérifier** : envoyer un message depuis l'interface et obtenir une réponse.

### Étape E — Adresse permanente
- **Faire** : `tailscale up`, puis
  `tailscale serve --bg --https=443 http://127.0.0.1:8080`.
- **Vérifier** : `tailscale serve status` affiche une adresse, et
  `curl` sur cette adresse renvoie `200`.
- **NE PAS** utiliser de tunnel éphémère : l'adresse doit rester stable.

### Étape F — Téléphone
- **Dire à l'utilisateur** : installer Tailscale sur le téléphone (même compte),
  ouvrir l'adresse, puis « Ajouter à l'écran d'accueil ».
- **Vérifier** : l'icône Argus apparaît sur l'écran d'accueil.

### À la fin, rapportez
- l'adresse fixe à ouvrir ;
- les étapes réussies ;
- toute étape en échec, avec le message exact.
