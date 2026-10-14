#!/usr/bin/env python3
# ============================================================================
#  serveur-ui.py — sert l'interface web Argus ET parle à l'agent confiné.
#
#  ARCHITECTURE (choix : le confinement est sacré)
#    Navigateur / PWA  →  CE SERVEUR (hôte, port local)  →  docker exec
#                                                        →  conteneur argus-confine
#                                                        →  hermes -p argus-client
#
#  Le conteneur argus N'EST PAS modifié et N'EXPOSE AUCUN PORT : ce serveur
#  est le seul pont, et il vit sur l'hôte. Confinement intact.
#
#  CE QU'IL SERT
#    /                      l'interface (ui-web/)
#    /api/message           POST  → envoie le texte à l'agent, renvoie sa réponse
#    /api/conversations     GET   → liste des discussions (persistées en JSON)
#    /api/conversations/{id} GET  → une discussion + ses messages
#    /api/conversations/{id} DELETE → supprime une discussion
#    /api/conversations     DELETE → supprime TOUTES les discussions
#    /api/upload            POST  → enregistre un fichier joint
#    /fichiers/{id}         GET   → sert un fichier joint
#
#  LANCEMENT
#    python3 serveur-ui.py [--port 8080]
#
#  PIÈGES CONNUS (vérifiés) :
#   - `hermes chat -q ... -Q --pass-session-id` : la sortie contient la réponse
#     PUIS `session_id: ...`. On sépare les deux → réponse propre côté UI.
#   - `docker` exige le groupe : on passe par `newgrp docker -c` si besoin.
#   - Le conteneur doit tourner : on le démarre via le wrapper ./argus si absent.
# ============================================================================
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, unquote

HERE = os.path.dirname(os.path.abspath(__file__))
UI_DIR = HERE                                  # ce script vit DANS ui-web/
ETAT_DIR = os.path.join(HERE, ".etat")           # persistance : conversations, fichiers
CONVS_FILE = os.path.join(ETAT_DIR, "conversations.json")
UPLOADS_DIR = os.path.join(ETAT_DIR, "uploads")
ARGUS_DEPLOY = "/home/momo/projects/argus-deploy"
CONTENEUR = "argus-confine"
PROFIL = "argus-client"

# Magasin de notifications PARTAGÉ hôte <-> conteneur (bind-mount ./notifs).
# L'agent écrit /opt/argus-notifs/notifications.json ; l'hôte voit le même
# fichier ici. C'est ce qui alimente le panneau et le badge de l'interface.
NOTIFS_FILE = "/home/momo/projects/argus-deploy/notifs/notifications.json"

_lock = threading.Lock()

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".pdf": "application/pdf",
    ".woff2": "font/woff2",
}


# ---------------------------------------------------------------- persistance
def _charger_convs():
    if not os.path.exists(CONVS_FILE):
        return []
    try:
        with open(CONVS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _sauver_convs(convs):
    os.makedirs(ETAT_DIR, exist_ok=True)
    tmp = CONVS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(convs, f, ensure_ascii=False, indent=1)
    os.replace(tmp, CONVS_FILE)


# ---------------------------------------------------------------------- docker
def _docker(argv, timeout=30):
    """Exécute `docker ...`. S'auto-élève via newgrp si le groupe manque."""
    base = ["docker"] + argv
    try:
        p = subprocess.run(base, capture_output=True, text=True, timeout=timeout)
        if p.returncode == 0:
            return p
        if "permission denied" not in (p.stderr or "").lower():
            return p
    except FileNotFoundError:
        raise RuntimeError("docker introuvable")
    except subprocess.TimeoutExpired:
        raise RuntimeError("docker: délai dépassé")

    # Retry via newgrp (une seule fois)
    import shlex
    cmd = "newgrp docker -c " + shlex.quote(" ".join(shlex.quote(a) for a in base))
    try:
        p = subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True, timeout=timeout)
        return p
    except subprocess.TimeoutExpired:
        raise RuntimeError("docker (newgrp): délai dépassé")


def conteneur_actif():
    p = _docker(["ps", "--filter", f"name=^{CONTENEUR}$", "--format", "{{.Names}}"])
    return p.returncode == 0 and p.stdout.strip() == CONTENEUR


def demarrer_conteneur():
    p = _docker(["start", CONTENEUR])
    if p.returncode == 0:
        return True
    # Repli : le wrapper ./argus sait démarrer proprement (compose).
    script = os.path.join(ARGUS_DEPLOY, "argus")
    if os.path.exists(script):
        subprocess.run(["bash", script, "--start"], capture_output=True, text=True, timeout=180)
    return conteneur_actif()


# ----------------------------------------------------------------- agent (chat)
_SID_RE = re.compile(r"^session_id:\s*(\S+)\s*$", re.M)
_WARN_RE = re.compile(r"^(Warning:|⚠️|↻ Resumed)", re.M)
# Bruit stderr : avertissements Python de modules internes (chemin + Syntax/
# DeprecationWarning). Rien de tout cela n'est une réponse de l'agent.
# On reste STRICT : filtrer trop large effacerait du contenu légitime.
_BRUIT_RE = re.compile(
    r"(SyntaxWarning:|DeprecationWarning:|RuntimeWarning:|UserWarning:|"
    r"^\S*\.py:\d+: .*[Ww]arning)",
)


def interroger_agent(texte, session_id=None, timeout=600):
    """Envoie `texte` au profil argus-client dans le conteneur.

    Renvoie (reponse_texte, nouveau_session_id).
    """
    if not conteneur_actif() and not demarrer_conteneur():
        raise RuntimeError("l'instance argus n'est pas démarrée (./argus --start)")

    argv = ["exec", CONTENEUR, "hermes", "-p", PROFIL, "chat",
            "-q", texte, "-Q", "--pass-session-id"]
    if session_id:
        argv += ["--resume", session_id]

    p = _docker(argv, timeout=timeout)
    out = (p.stdout or "") + (("\n" + p.stderr) if p.stderr else "")
    if p.returncode != 0:
        raise RuntimeError("l'agent a échoué: " + (p.stderr or p.stdout or "")[-400:])

    # Le session_id arrive en dernière ligne ; on retire les lignes techniques.
    sid = None
    m = _SID_RE.search(out)
    if m:
        sid = m.group(1)
    lignes = []
    for ln in out.splitlines():
        if _SID_RE.match(ln):
            continue
        if ln.startswith("Warning:") or ln.startswith("⚠️") or ln.startswith("↻ Resumed"):
            continue
        # Bruit stderr de l'interpréteur (SyntaxWarning de modules internes) :
        # sans ce filtre il apparaîtrait au milieu de la réponse du client.
        if _BRUIT_RE.search(ln):
            continue
        lignes.append(ln)
    reponse = "\n".join(lignes).strip()
    if not reponse:
        raise RuntimeError("réponse vide de l'agent")
    return reponse, sid


def titre_depuis(texte, fichiers):
    base = (texte or "").strip().replace("\n", " ")
    if not base and fichiers:
        base = fichiers[0].get("nom", "Nouvelle discussion")
    base = base or "Nouvelle discussion"
    return base[:45] + ("…" if len(base) > 45 else "")


# ---------------------------------------------------------------- notifications
def _lire_notifs():
    """Lit le magasin partagé. Renvoie (notifications, vues)."""
    if not os.path.exists(NOTIFS_FILE):
        return [], {}
    try:
        with open(NOTIFS_FILE, "r", encoding="utf-8") as f:
            d = json.load(f)
    except Exception:
        return [], {}
    return d.get("notifications", []), d.get("vues", {})


def _ecrire_notifs(notifications):
    """Réécrit le magasin (marquer-lu). Atomique ; tolère un échec de droits.

    PIÈGE RÉSOLU : le magasin est partagé entre l'hôte (uid 1000) et l'agent
    (uid 10000). os.replace() remplace le fichier, ce qui change son
    propriétaire et son mode -> l'autre côté ne pourrait plus le lire. On
    remet donc explicitement un mode 666 après écriture : chacun peut lire ET
    réécrire, c'est un magasin de notifications (aucune donnée sensible).
    """
    d = {"notifications": notifications, "vues": {}}
    try:
        os.makedirs(os.path.dirname(NOTIFS_FILE), exist_ok=True)
        tmp = NOTIFS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
        os.replace(tmp, NOTIFS_FILE)
        try:
            os.chmod(NOTIFS_FILE, 0o666)
        except OSError:
            pass
        return True
    except Exception:
        return False


def _resume_notifs():
    notifs, _ = _lire_notifs()
    par_type, par_sev, non_lues = {}, {}, 0
    for n in notifs:
        par_type[n.get("type", "?")] = par_type.get(n.get("type", "?"), 0) + 1
        par_sev[n.get("severite", "?")] = par_sev.get(n.get("severite", "?"), 0) + 1
        if not n.get("lu"):
            non_lues += 1
    return {"total": len(notifs), "non_lues": non_lues,
            "par_type": par_type, "par_severite": par_sev,
            "plus_recente": notifs[-1].get("cree_le") if notifs else None}


# -------------------------------------------------------------------- handler
class Handler(BaseHTTPRequestHandler):
    server_version = "ArgusUI/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *a):
        sys.stderr.write("[ui] %s - %s\n" % (self.address_string(), fmt % a))

    # ---- utilitaires ------------------------------------------------------
    def _envoyer(self, code, corps, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(corps, (dict, list)):
            corps = json.dumps(corps, ensure_ascii=False).encode("utf-8")
        elif isinstance(corps, str):
            corps = corps.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(corps)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(corps)

    def _json(self, obj, code=200):
        self._envoyer(code, obj)

    def _erreur(self, code, msg):
        self._json({"erreur": msg}, code)

    def _corps_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0:
            return {}
        return json.loads(self.rfile.read(n).decode("utf-8"))

    # ---- GET --------------------------------------------------------------
    def do_GET(self):
        chemin = urlparse(self.path).path
        try:
            if chemin == "/api/conversations":
                return self._json(_charger_convs())
            if chemin.startswith("/api/conversations/"):
                cid = unquote(chemin[len("/api/conversations/"):])
                for c in _charger_convs():
                    if c["id"] == cid:
                        return self._json(c)
                return self._erreur(404, "discussion inconnue")
            if chemin.startswith("/fichiers/"):
                return self._servir_fichier(unquote(chemin[len("/fichiers/"):]))
            if chemin == "/api/sante":
                return self._json({"ok": True, "conteneur": conteneur_actif()})
            if chemin == "/api/notifications":
                return self._notifications()
            return self._servir_statique(chemin)
        except Exception as e:
            return self._erreur(500, str(e))

    # ---- DELETE -----------------------------------------------------------
    def do_DELETE(self):
        """Suppression de discussions.

        /api/conversations/{id}  → retire UNE discussion de conversations.json
        /api/conversations        → retire TOUTES les discussions

        Les fichiers joints (dossier .etat/uploads) ne sont pas touchés : ils
        peuvent être référencés par d'autres discussions. Réponses idempotentes.
        """
        chemin = urlparse(self.path).path
        try:
            if chemin == "/api/conversations":
                with _lock:
                    n = len(_charger_convs())
                    _sauver_convs([])
                return self._json({"supprimees": n, "restantes": 0})

            if chemin.startswith("/api/conversations/"):
                cid = unquote(chemin[len("/api/conversations/"):])
                if not cid or "/" in cid:
                    return self._erreur(400, "identifiant invalide")
                with _lock:
                    convs = _charger_convs()
                    restantes = [c for c in convs if c.get("id") != cid]
                    if len(restantes) == len(convs):
                        return self._erreur(404, "discussion inconnue")
                    _sauver_convs(restantes)
                return self._json({"id": cid, "supprimee": True,
                                   "restantes": len(restantes)})

            return self._erreur(404, "introuvable")
        except Exception as e:
            return self._erreur(500, str(e))

    def _servir_statique(self, chemin):
        if chemin in ("/", ""):
            chemin = "/index.html"
        rel = chemin.lstrip("/")
        cible = os.path.normpath(os.path.join(UI_DIR, rel))
        # Refuse la traversée ET les dossiers internes (.etat, .git…) : jamais exposés.
        interdit = (".etat", ".git")
        morceaux = os.path.relpath(cible, UI_DIR).split(os.sep)
        if (not cible.startswith(UI_DIR) or not os.path.isfile(cible)
                or any(p in interdit for p in morceaux)):
            return self._erreur(404, "introuvable")
        ext = os.path.splitext(cible)[1].lower()
        with open(cible, "rb") as f:
            data = f.read()
        extra = {"Service-Worker-Allowed": "/"}
        self._envoyer(200, data, MIME.get(ext, "application/octet-stream"), extra)

    # ---- notifications -----------------------------------------------------
    def _notifications(self):
        """Lit le magasin partagé. Paramètres : ?limite=N&type=X&non_lues=1"""
        from urllib.parse import parse_qs
        q = parse_qs(urlparse(self.path).query)
        limite = int((q.get("limite") or ["50"])[0])
        type_f = (q.get("type") or [None])[0]
        non_lues = (q.get("non_lues") or ["0"])[0] in ("1", "true", "oui")

        notifs, _ = _lire_notifs()
        notifs = list(reversed(notifs))            # les plus récentes d'abord
        if non_lues:
            notifs = [n for n in notifs if not n.get("lu")]
        if type_f:
            notifs = [n for n in notifs if n.get("type") == type_f]
        return self._json({
            "notifications": notifs[:limite],
            "resume": _resume_notifs(),
        })

    def _marquer_notifs(self):
        """POST { ids: [...] } ou { tous: true } — marque comme lues."""
        data = self._corps_json()
        ids = set(data.get("ids") or [])
        tous = bool(data.get("tous"))
        notifs, _ = _lire_notifs()
        n = 0
        for x in notifs:
            if tous or x.get("id") in ids:
                if not x.get("lu"):
                    x["lu"] = True
                    x["lu_le"] = _iso()
                    n += 1
        ok = _ecrire_notifs(notifs)
        return self._json({"modifiees": n, "ecrit": ok, "resume": _resume_notifs()})

    def _servir_fichier(self, fid):
        for f in _tous_fichiers():
            if f["id"] == fid:
                chemin = os.path.join(UPLOADS_DIR, fid + os.path.splitext(f["nom"])[1])
                if os.path.isfile(chemin):
                    with open(chemin, "rb") as fh:
                        data = fh.read()
                    return self._envoyer(200, data, f.get("type") or "application/octet-stream")
        return self._erreur(404, "fichier inconnu")

    # ---- POST -------------------------------------------------------------
    def do_POST(self):
        chemin = urlparse(self.path).path
        try:
            if chemin == "/api/message":
                return self._message()
            if chemin == "/api/upload":
                return self._upload()
            if chemin == "/api/notifications/lire":
                return self._marquer_notifs()
            return self._erreur(404, "introuvable")
        except Exception as e:
            return self._erreur(500, str(e))

    def _message(self):
        data = self._corps_json()
        texte = (data.get("texte") or "").strip()
        conv_id = data.get("conversationId")
        fichiers_ids = data.get("fichiers") or []

        with _lock:
            convs = _charger_convs()
            conv = next((c for c in convs if c["id"] == conv_id), None)
            if conv is None:
                conv = {"id": "c-" + uuid.uuid4().hex[:8], "titre": "",
                        "date": _iso(), "session_hermes": None, "messages": []}
                convs.append(conv)

            joints = [f for f in _tous_fichiers() if f["id"] in fichiers_ids]

            # Trace le message utilisateur.
            msg_user = {"id": "m-" + uuid.uuid4().hex[:8], "role": "user",
                        "texte": texte, "date": _iso(), "fichiers": joints}
            conv["messages"].append(msg_user)

            # Compose le prompt : texte + mention des pièces jointes (leur chemin
            # dans le conteneur est fourni à l'agent via /workspace n'existe pas ici ;
            # on lui donne au moins le nom et le type).
            prompt = texte
            if joints:
                liste = "\n".join(f"- {j['nom']} ({j.get('type','?')})" for j in joints)
                prompt = (texte + "\n\nPièces jointes fournies par l'utilisateur :\n" + liste).strip()

            try:
                reponse, sid = interroger_agent(prompt, conv.get("session_hermes"))
            except Exception as e:
                conv["messages"].pop()  # n'enregistre pas un échec comme message
                _sauver_convs(convs)
                return self._erreur(502, "agent injoignable: " + str(e))

            if sid:
                conv["session_hermes"] = sid
            if not conv["titre"]:
                conv["titre"] = titre_depuis(texte, joints)
            conv["date"] = _iso()

            msg_agent = {"id": "m-" + uuid.uuid4().hex[:8], "role": "argus",
                         "texte": reponse, "date": _iso(), "fichiers": []}
            conv["messages"].append(msg_agent)
            _sauver_convs(convs)

        return self._json({"conversationId": conv["id"], "titre": conv["titre"],
                           "message": msg_agent})

    def _upload(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return self._erreur(400, "multipart attendu")
        boundary = ctype.split("boundary=")[-1].strip().strip('"')
        n = int(self.headers.get("Content-Length") or 0)
        corps = self.rfile.read(n)

        # Extraction minimale du premier champ fichier.
        delim = b"--" + boundary.encode()
        parts = corps.split(delim)
        for part in parts:
            if b"filename=" not in part:
                continue
            entetes, _, contenu = part.partition(b"\r\n\r\n")
            contenu = contenu.rstrip(b"\r\n")
            if contenu.endswith(b"--"):
                contenu = contenu[:-2]
            nom = _champ(entetes, b"filename")
            typ = _champ(entetes, b"Content-Type") or "application/octet-stream"
            if not nom:
                continue
            fid = "f-" + uuid.uuid4().hex[:8]
            os.makedirs(UPLOADS_DIR, exist_ok=True)
            ext = os.path.splitext(nom)[1]
            with open(os.path.join(UPLOADS_DIR, fid + ext), "wb") as f:
                f.write(contenu)
            ref = {"id": fid, "nom": nom, "type": typ, "taille": len(contenu),
                   "url": "/fichiers/" + fid, "date": _iso()}
            _ajouter_fichier(ref)
            return self._json(ref)
        return self._erreur(400, "aucun fichier dans la requête")


def _champ(entetes, cle):
    for ln in entetes.split(b"\r\n"):
        if ln.lower().startswith(cle.lower() + b":"):
            return ln.split(b":", 1)[1].strip().decode("utf-8", "replace")
        if cle.lower() == b"filename" and ln.lower().startswith(b"content-disposition"):
            for morceau in ln.decode("utf-8", "replace").split(";"):
                if morceau.strip().startswith("filename="):
                    return morceau.split("=", 1)[1].strip().strip('"')
    return ""


def _iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _tous_fichiers():
    fichiers = []
    for c in _charger_convs():
        for m in c.get("messages", []):
            fichiers.extend(m.get("fichiers") or [])
    return fichiers


def _ajouter_fichier(ref):
    """Les fichiers joints vivent dans une clé dédiée du fichier d'état."""
    os.makedirs(ETAT_DIR, exist_ok=True)
    idx = os.path.join(ETAT_DIR, "fichiers.json")
    liste = []
    if os.path.exists(idx):
        try:
            with open(idx, "r", encoding="utf-8") as f:
                liste = json.load(f)
        except Exception:
            liste = []
    liste.append(ref)
    with open(idx, "w", encoding="utf-8") as f:
        json.dump(liste, f, ensure_ascii=False, indent=1)


def main():
    ap = argparse.ArgumentParser(description="Serveur de l'interface Argus + pont agent.")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--host", default="0.0.0.0")
    args = ap.parse_args()

    if not os.path.isdir(UI_DIR):
        sys.exit(f"ERREUR : {UI_DIR} introuvable (décompacter ui-web.zip).")
    os.makedirs(UPLOADS_DIR, exist_ok=True)

    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[ui] interface Argus servie sur http://{args.host}:{args.port}")
    print(f"[ui] conteneur {CONTENEUR} : {'en ligne' if conteneur_actif() else 'ARRÊTÉ'}")
    print("[ui] Ctrl-C pour arrêter.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n[ui] arrêt.")
        srv.shutdown()


if __name__ == "__main__":
    main()
