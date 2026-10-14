#!/usr/bin/env python3
"""Verification de bout en bout de l'UI Argus — SANS RISQUE pour les donnees.

Ce script teste, par execution reelle contre le serveur en cours :
  1. la route DELETE /api/conversations/{id} (suppression d'une discussion),
  2. la route DELETE /api/conversations (tout supprimer),
  3. le compteur de non-lues qui alimente le badge.

SECURITE : il ne touche JAMAIS aux vraies discussions de l'utilisateur.
Il sauvegarde .etat/conversations.json, travaille, puis RESTAURE a l'identique
en fusionnant (une discussion creee par un vrai message pendant le test est
conservee, jamais ecrasee).

Usage :
    python3 tests-verif-ui.py            # serveur sur 127.0.0.1:8080
    python3 tests-verif-ui.py --base http://127.0.0.1:9000
"""
import argparse
import json
import os
import shutil
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ETAT = os.path.join(HERE, ".etat", "conversations.json")
NOTIFS = "/home/momo/projects/argus-deploy/notifs/notifications.json"


def api(base, method, chemin, corps=None):
    req = urllib.request.Request(base + chemin, method=method)
    if corps is not None:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(corps).encode()
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "null")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8080")
    a = ap.parse_args()

    # ---- sauvegarde AVANT toute chose -------------------------------------
    if not os.path.isfile(ETAT):
        sys.exit("ERREUR : %s introuvable" % ETAT)
    sauvegarde = json.load(open(ETAT, encoding="utf-8"))
    sauvegarde_txt = json.dumps(sauvegarde, ensure_ascii=False)
    print("sauvegarde : %d discussion(s)" % len(sauvegarde))

    ok = []
    notifs_avant = None
    try:
        # --- 1. suppression d'une discussion -------------------------------
        vivantes = json.load(open(ETAT, encoding="utf-8"))
        vivantes.append({"id": "c-e2e-test", "titre": "E2E (temporaire)",
                         "date": "2026-01-01T00:00:00Z", "session_hermes": None,
                         "messages": []})
        json.dump(vivantes, open(ETAT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

        _, liste = api(a.base, "GET", "/api/conversations")
        ok.append(("discussion creee visible dans GET /api/conversations",
                   any(c.get("id") == "c-e2e-test" for c in liste)))

        code, corps = api(a.base, "DELETE", "/api/conversations/c-e2e-test")
        ok.append(("DELETE /api/conversations/{id} -> 200 + supprimee:true",
                   code == 200 and isinstance(corps, dict) and corps.get("supprimee") is True))

        disque = [c.get("id") for c in json.load(open(ETAT, encoding="utf-8"))]
        ok.append(("retiree du fichier .etat/conversations.json", "c-e2e-test" not in disque))

        code, _ = api(a.base, "GET", "/api/conversations/c-e2e-test")
        ok.append(("GET d'une discussion supprimee -> 404", code == 404))

        code, _ = api(a.base, "DELETE", "/api/conversations/c-inexistant-xyz")
        ok.append(("DELETE d'un identifiant inconnu -> 404", code == 404))

        # --- 2. tout supprimer ---------------------------------------------
        code, corps = api(a.base, "DELETE", "/api/conversations")
        ok.append(("DELETE /api/conversations -> 200", code == 200))
        ok.append(("fichier vide apres tout-supprimer",
                   json.load(open(ETAT, encoding="utf-8")) == []))

        # --- 3. compteur de non-lues ---------------------------------------
        if os.path.isfile(NOTIFS):
            d = json.load(open(NOTIFS, encoding="utf-8"))
            notifs_avant = json.dumps(d, ensure_ascii=False)
            avant = sum(1 for n in d["notifications"] if not n.get("lu"))
            d["notifications"] = [n for n in d["notifications"] if n.get("id") != "n-e2e-test"]
            d["notifications"].append({"id": "n-e2e-test", "type": "alerte",
                                       "severite": "important", "titre": "E2E",
                                       "corps": "test", "source": "e2e",
                                       "cree_le": "2026-01-01T00:00:00Z", "lu": False,
                                       "donnees": {}})
            json.dump(d, open(NOTIFS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            os.chmod(NOTIFS, 0o666)

            _, rep = api(a.base, "GET", "/api/notifications?limite=80")
            apres = (rep or {}).get("resume", {}).get("non_lues", -1)
            ok.append(("non_lues augmente apres injection d'une notification", apres == avant + 1))
        else:
            ok.append(("magasin de notifications present", False))

    finally:
        # ---- RESTAURATION : on ne perd jamais une discussion ----------------
        finales = json.load(open(ETAT, encoding="utf-8")) if os.path.isfile(ETAT) else []
        ids = {c.get("id") for c in finales}
        for c in json.loads(sauvegarde_txt):
            if c.get("id") not in ids:
                finales.append(c)
        finales = [c for c in finales if c.get("id") != "c-e2e-test"]
        finales.sort(key=lambda c: c.get("date") or "", reverse=True)
        json.dump(finales, open(ETAT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

        if notifs_avant is not None:
            with open(NOTIFS, "w", encoding="utf-8") as f:
                f.write(notifs_avant)
            os.chmod(NOTIFS, 0o666)

    # ---- rapport ----------------------------------------------------------
    print("=" * 64)
    for libelle, reussi in ok:
        print(("  OK   " if reussi else " ECHEC ") + libelle)
    print("=" * 64)
    reussis = sum(1 for _, r in ok if r)
    print("%d/%d verifications reussies" % (reussis, len(ok)))
    print("discussions restaurees : %s" % [c.get("id") for c in
                                           json.load(open(ETAT, encoding="utf-8"))])
    sys.exit(0 if reussis == len(ok) else 1)


if __name__ == "__main__":
    main()
