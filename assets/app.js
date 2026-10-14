/* ==========================================================
   Argus — interface web (HTML / CSS / JS vanilla, sans build)
   1. Utilitaires et rendu markdown
   2. ArgusAPI  ← SEUL point de contact avec le futur backend
   3. Interface (panneau, chat, pièces jointes, voix)
   ========================================================== */
'use strict';

/* ==========================================================
   1. UTILITAIRES
   ========================================================== */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const uid = () => Math.random().toString(36).slice(2, 10);
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const copie = (o) => JSON.parse(JSON.stringify(o));
const ilYa = (min) => new Date(Date.now() - min * 60000).toISOString();
const joursAvant = (j, h, m) => {
  const d = new Date();
  d.setDate(d.getDate() - j);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const fmtJour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmtJourAn = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

function dateCourte(iso) {
  const d = new Date(iso);
  const auj = new Date();
  const h = new Date(); h.setDate(h.getDate() - 1);
  if (d.toDateString() === auj.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === h.toDateString()) return 'Hier';
  return d.getFullYear() === auj.getFullYear() ? fmtJour.format(d) : fmtJourAn.format(d);
}
const heure = (iso) => fmtHeure.format(new Date(iso));

function tailleLisible(n) {
  if (!n) return '';
  if (n < 1024) return n + ' o';
  if (n < 1048576) return Math.round(n / 1024) + ' Ko';
  return (n / 1048576).toFixed(1).replace('.', ',') + ' Mo';
}
const extension = (nom) => {
  const m = String(nom || '').match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toUpperCase() : 'FICHIER';
};
const estImage = (f) => String((f && f.type) || '').startsWith('image/');

/* ---------- Rendu markdown léger ----------
   Titres (#), listes (- / 1.), citations (>), gras, italique, liens, code,
   et bloc « chiffre clé » :  [[chiffre: 5 500 €/m² | Libellé | Source]]
   Les montants (€, €/m², m², %) sont mis en valeur automatiquement. */
const NUM_RE = /\d{1,3}(?:[\s  ]\d{3})+(?:[.,]\d+)?\s?(?:€\/m²|€|%|m²)|\d+(?:[.,]\d+)?\s?(?:€\/m²|€|%|m²)/g;

function inline(s) {
  s = esc(s);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>');
  s = s.split(/(<[^>]+>)/).map((p) => (p.charAt(0) === '<' ? p : p.replace(NUM_RE, '<span class="num">$&</span>'))).join('');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => '<code>' + codes[n] + '</code>');
  return s;
}

function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const out = [];
  const reUl = /^\s*[-*•]\s+/;
  const reOl = /^\s*\d+[.)]\s+/;
  const special = (l) => /^\s*$/.test(l) || /^#{1,3}\s/.test(l) || reUl.test(l) || reOl.test(l)
    || /^>/.test(l) || /^\[\[chiffre:/i.test(l) || /^---+\s*$/.test(l);
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    let m;
    if (/^\s*$/.test(l)) { i++; continue; }
    if ((m = l.match(/^\[\[chiffre:\s*(.+?)\s*\]\]\s*$/i))) {
      const p = m[1].split('|').map((x) => x.trim());
      out.push('<div class="kpi"><div class="kpi-value">' + esc(p[0]) + '</div>'
        + (p[1] ? '<div class="kpi-label">' + esc(p[1]) + '</div>' : '')
        + (p[2] ? '<div class="kpi-src">' + esc(p[2]) + '</div>' : '') + '</div>');
      i++; continue;
    }
    if ((m = l.match(/^(#{1,3})\s+(.*)$/))) {
      const n = m[1].length + 2;
      out.push('<h' + n + '>' + inline(m[2]) + '</h' + n + '>');
      i++; continue;
    }
    if (/^---+\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^>/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push('<blockquote>' + inline(buf.join(' ')) + '</blockquote>');
      continue;
    }
    if (reUl.test(l)) {
      const items = [];
      while (i < lines.length && reUl.test(lines[i])) { items.push(lines[i].replace(reUl, '')); i++; }
      out.push('<ul>' + items.map((t) => '<li>' + inline(t) + '</li>').join('') + '</ul>');
      continue;
    }
    if (reOl.test(l)) {
      const items = [];
      while (i < lines.length && reOl.test(lines[i])) { items.push(lines[i].replace(reOl, '')); i++; }
      out.push('<ol>' + items.map((t) => '<li>' + inline(t) + '</li>').join('') + '</ol>');
      continue;
    }
    const buf = [l];
    i++;
    while (i < lines.length && !special(lines[i])) { buf.push(lines[i]); i++; }
    out.push('<p>' + buf.map(inline).join('<br>') + '</p>');
  }
  return out.join('');
}

/* Texte brut d'un message (copie, lecture vocale) */
function texteBrut(src, pourVoix) {
  const lignes = String(src || '').replace(/\r/g, '').split('\n').map((l) => {
    let m;
    if ((m = l.match(/^\[\[chiffre:\s*(.+?)\s*\]\]\s*$/i))) {
      const p = m[1].split('|').map((x) => x.trim());
      l = (p[1] ? p[1] + ' : ' : '') + p[0] + (p[2] ? '. ' + p[2] : '');
    }
    l = l.replace(/^#{1,3}\s+/, '').replace(/^>\s?/, '').replace(/^\s*[-*•]\s+/, '').replace(/^\s*\d+[.)]\s+/, '');
    l = l.replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, '$1').replace(/[*`]/g, '').trim();
    if (pourVoix && l && !/[.!?…:;]$/.test(l)) l += '.';
    return l;
  }).filter((l) => l);
  return lignes.join('\n');
}

function texteParle(src) {
  return texteBrut(src, true)
    .replace(/(\d)[\s  ](?=\d{3}(?!\d))/g, '$1')
    .replace(/€\s?\/\s?m²/g, ' euros le mètre carré')
    .replace(/m²/g, ' mètres carrés')
    .replace(/€/g, ' euros')
    .replace(/%/g, ' pour cent')
    .replace(/\bDVF\b/g, 'D V F')
    .replace(/[·—–]/g, ', ')
    .replace(/\s+/g, ' ');
}

function decouper(txt) {
  const phrases = String(txt).match(/[^.!?…;:]+[.!?…;:]*\s*/g) || [String(txt)];
  const out = [];
  let cur = '';
  for (const p of phrases) {
    if (cur && (cur + p).length > 200) { out.push(cur.trim()); cur = p; } else { cur += p; }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* ==========================================================
   2. ArgusAPI — TOUS les appels au backend passent par ici
   Les corps sont SIMULÉS (données en mémoire, petit délai).
   Remplacez chaque bloc marqué « BRANCHEMENT BACKEND ICI »
   par un vrai fetch (formats décrits dans le README).
   ========================================================== */
class ArgusAPI {
  constructor() {
    this.simule = false; // backend réel branché (voir serveur-ui.py) — le badge « Démo » est masqué
    this._db = this._donneesDemo();
  }

  /** Envoie un message (et ses fichiers déjà uploadés) ; renvoie la réponse d'Argus. */
  async envoyerMessage(texte, fichiers = [], conversationId = null) {
    const rep = await fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, texte, fichiers: fichiers.map((f) => f.id) })
    });
    if (!rep.ok) {
      let detail = 'Erreur ' + rep.status;
      try { const j = await rep.json(); if (j && j.erreur) detail = j.erreur; } catch (e) { /* ignore */ }
      throw new Error(detail);
    }
    return await rep.json();   // { conversationId, titre, message }
  }

  /** Liste des discussions (la plus récente d'abord), avec leurs fichiers. */
  async listerConversations() {
    const rep = await fetch('/api/conversations');
    if (!rep.ok) throw new Error('Erreur ' + rep.status);
    const convs = await rep.json();
    return convs.map((c) => {
      const dernier = c.messages && c.messages.length ? c.messages[c.messages.length - 1] : null;
      return {
        id: c.id,
        titre: c.titre || 'Nouvelle discussion',
        date: c.date || (dernier ? dernier.date : new Date().toISOString()),
        fichiers: (c.messages || []).flatMap((m) => (m.fichiers || []).map(
          (f) => Object.assign({}, f, { date: m.date, conversationId: c.id })))
      };
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  /** Messages d'une discussion. */
  async chargerConversation(id) {
    const rep = await fetch('/api/conversations/' + encodeURIComponent(id));
    if (!rep.ok) throw new Error('Erreur ' + rep.status);
    return await rep.json();   // { id, titre, date, messages: [...] }
  }

  /** Envoie un fichier ; renvoie une référence { id, nom, type, taille, url }. */
  async uploaderFichier(fichier) {
    const fd = new FormData();
    fd.append('fichier', fichier);
    const rep = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!rep.ok) throw new Error('Erreur ' + rep.status);
    return await rep.json();   // { id, nom, type, taille, url }
  }

  /** Supprime UNE discussion (irréversible). */
  async supprimerConversation(id) {
    const rep = await fetch('/api/conversations/' + encodeURIComponent(id), { method: 'DELETE' });
    if (!rep.ok) throw new Error('Erreur ' + rep.status);
    return await rep.json();   // { id, supprimee: true, restantes: N }
  }

  /** Supprime TOUTES les discussions. */
  async supprimerTout() {
    const rep = await fetch('/api/conversations', { method: 'DELETE' });
    if (!rep.ok) throw new Error('Erreur ' + rep.status);
    return await rep.json();   // { supprimees: N, restantes: 0 }
  }

  /* ----- Simulation (à supprimer avec le branchement) ----- */
  _titre(texte, fichiers) {
    const base = String(texte || '').trim().replace(/\s+/g, ' ') || (fichiers[0] && fichiers[0].nom) || 'Nouvelle discussion';
    return base.length > 42 ? base.slice(0, 41).trim() + '…' : base;
  }

  _repondre(texte, fichiers) {
    const t = String(texte || '').toLowerCase();
    if (fichiers.length) {
      const noms = fichiers.map((f) => f.nom).join('**, **');
      return 'Merci, j\'ai bien reçu ' + (fichiers.length > 1 ? 'vos fichiers' : 'votre fichier') + ' : **' + noms + '**.\n\n'
        + 'Pour aller plus loin, dites-moi ce que vous souhaitez en tirer :\n'
        + '- une estimation du bien\n- une comparaison avec les ventes récentes du quartier\n- un résumé à transmettre à votre client\n\n'
        + '> Réponse de démonstration : l\'analyse réelle des fichiers sera disponible une fois Argus connecté.';
    }
    if (/estim|valeur|vaut/.test(t)) {
      return 'Voici une première estimation, à affiner avec les caractéristiques exactes du bien.\n\n'
        + '[[chiffre: 4 900 €/m² | Prix médian des appartements anciens, Lyon 3e | Source : ventes réelles DVF, 2024]]\n\n'
        + 'Sur la base d\'un bien de **90 m²**, cela donne une valeur centrale d\'environ **441 000 €**, '
        + 'soit une fourchette de **420 000 € à 460 000 €** selon l\'étage, l\'état et la luminosité.\n\n'
        + '> Sources : DVF (Etalab), transactions 2024. Les fourchettes sont indicatives.';
    }
    if (/quartier|croix|brotteaux|massena|ambiance/.test(t)) {
      return 'Voici une lecture rapide du quartier.\n\n'
        + '[[chiffre: 5 300 €/m² | Prix médian, Croix-Rousse (Lyon 4e) | Source : ventes réelles DVF, 2024]]\n\n'
        + '- **Demande** : forte, les biens bien situés se vendent vite\n'
        + '- **Loyers** : autour de **17 €/m²** par mois, soit un rendement brut théorique d\'environ **3,8 %**\n'
        + '- **Points d\'attention** : pentes, stationnement difficile, copropriétés anciennes\n\n'
        + '> Sources : DVF 2024 (prix) ; Observatoire des loyers de l\'agglomération lyonnaise, 2024 (loyers).';
    }
    if (/^(bonjour|salut|hello|bonsoir)\b/.test(t)) {
      return 'Bonjour ! Dites-moi ce que vous cherchez : un bien à estimer, un quartier à analyser ou des annonces à comparer.';
    }
    return 'Bien noté. Pour vous répondre avec des chiffres fiables et sourcés, j\'ai besoin de quelques précisions :\n\n'
      + '- **Où ?** arrondissement, quartier ou rue\n'
      + '- **Quel bien ?** type, surface approximative, état\n'
      + '- **Quel objectif ?** estimation, achat, mise en vente\n\n'
      + 'Dès que j\'ai ces éléments, je vous donne les prix au m² avec leurs sources.';
  }

  _donneesDemo() {
    const m = (role, texte, date, fichiers) => ({ id: 'm-' + uid(), role, texte, date, fichiers: fichiers || [] });
    const plan = { id: 'f-plan', nom: 'Plan-T3-rue-Vauban.svg', type: 'image/svg+xml', taille: 9400, url: 'assets/demo/plan-vauban.svg' };
    const facade = { id: 'f-facade', nom: 'Facade-Garibaldi.svg', type: 'image/svg+xml', taille: 7600, url: 'assets/demo/facade-garibaldi.svg' };
    const dpe = { id: 'f-dpe', nom: 'Diagnostic-DPE-Garibaldi.pdf', type: 'application/pdf', taille: 412000, url: '' };
    const mandat = { id: 'f-mandat', nom: 'Mandat-Villeurbanne.pdf', type: 'application/pdf', taille: 268000, url: '' };

    return [
      {
        id: 'c-t3-lyon6', titre: 'Recherche T3 Lyon 6e',
        messages: [
          m('argus', 'Bonjour ! Je suis Argus, votre assistant immobilier. Que cherchez-vous ?', ilYa(41)),
          m('user', 'Un appartement 3 pièces à Lyon 6e, budget 450 000 €.', ilYa(40)),
          m('argus',
            'Voici ce que je constate pour un **3 pièces à Lyon 6e**.\n\n'
            + '[[chiffre: 5 500 €/m² | Prix médian du marché, Lyon 6e | Source : ventes réelles DVF, 2024]]\n\n'
            + 'Avec 450 000 €, vous visez environ **82 m²**. Trois biens correspondent aujourd\'hui :\n\n'
            + '- **Rue Vauban** : T3 de 78 m², **429 000 €** (5 500 €/m²), 3e étage avec ascenseur\n'
            + '- **Rue Duquesne** : T3 de 72 m², **398 000 €** (5 530 €/m²), à rafraîchir\n'
            + '- **Boulevard des Belges** : T3 de 85 m², **465 000 €** (5 470 €/m²), légèrement au-dessus du budget\n\n'
            + '> Sources : DVF (Etalab), transactions 2024 ; annonces en ligne consultées aujourd\'hui.',
            ilYa(39)),
          m('user', 'Voici le plan du bien rue Vauban. Qu\'en pensez-vous ?', ilYa(14), [plan]),
          m('argus',
            'J\'ai bien reçu le plan du **T3 rue Vauban**. Voici ce que j\'en retiens :\n\n'
            + '- **Surface** : environ **78 m²**, avec un séjour ouvert sur l\'entrée\n'
            + '- **Agencement** : deux chambres, cuisine séparée, salle de bains avec WC\n'
            + '- **Atout** : le balcon prolonge le séjour\n\n'
            + 'À **429 000 €**, le bien ressort à **5 500 €/m²**, en ligne avec le marché du secteur.\n\n'
            + '> Source : ventes réelles DVF, 2024. Plan fourni par vos soins.',
            ilYa(13))
        ]
      },
      {
        id: 'c-garibaldi', titre: 'Estimation rue Garibaldi',
        messages: [
          m('user', 'Peux-tu estimer un T4 de 92 m² rue Garibaldi, Lyon 3e ? Je joins la façade et le DPE.', joursAvant(1, 16, 20), [facade, dpe]),
          m('argus',
            'Voici une estimation pour votre **T4 de 92 m²**.\n\n'
            + '[[chiffre: 4 900 €/m² | Prix médian, appartements anciens, Lyon 3e | Source : ventes réelles DVF, 2024]]\n\n'
            + 'Valeur centrale : environ **450 000 €**, avec une fourchette de **430 000 € à 470 000 €** selon l\'état intérieur et l\'étage.\n\n'
            + '> Sources : DVF (Etalab), transactions 2024. Estimation indicative.',
            joursAvant(1, 16, 22))
        ]
      },
      {
        id: 'c-croix-rousse', titre: 'Analyse quartier Croix-Rousse',
        messages: [
          m('user', 'Que vaut le quartier de la Croix-Rousse pour un investisseur ?', joursAvant(3, 11, 5)),
          m('argus',
            'Voici une lecture rapide pour un investisseur.\n\n'
            + '[[chiffre: 5 300 €/m² | Prix médian, Croix-Rousse (Lyon 4e) | Source : ventes réelles DVF, 2024]]\n\n'
            + '- **Loyers** : autour de **17 €/m²** par mois\n'
            + '- **Rendement brut théorique** : environ **3,8 %**\n'
            + '- **Points d\'attention** : pentes, stationnement, copropriétés anciennes\n\n'
            + '> Sources : DVF 2024 ; Observatoire des loyers de l\'agglomération lyonnaise, 2024.',
            joursAvant(3, 11, 7))
        ]
      },
      {
        id: 'c-villeurbanne', titre: 'Comparatif Villeurbanne / Lyon 3e',
        messages: [
          m('user', 'Compare les prix entre Villeurbanne et Lyon 3e. Le mandat est en pièce jointe.', joursAvant(6, 9, 40), [mandat]),
          m('argus',
            'Voici le comparatif des prix médians.\n\n'
            + '[[chiffre: 600 €/m² | Écart entre Lyon 3e et Villeurbanne | Source : ventes réelles DVF, 2024]]\n\n'
            + '- **Lyon 3e** : **4 900 €/m²**\n'
            + '- **Villeurbanne** : **4 300 €/m²**, soit environ **12 %** de moins\n\n'
            + '> Source : DVF (Etalab), transactions 2024.',
            joursAvant(6, 9, 42))
        ]
      }
    ];
  }
}

/* ======== INTERFACE ======== */

/* ==========================================================
   3. INTERFACE
   ========================================================== */
const api = new ArgusAPI();

const el = {};
['app', 'sidebar', 'scrim', 'btnNew', 'convList', 'fileList', 'btnMenu', 'sbClose', 'chatTitle', 'demoPill',
  'messages', 'thread', 'composer', 'tray', 'btnPlus', 'plusMenu', 'miFile', 'miCamera', 'input', 'btnMic',
  'btnSend', 'fileInput', 'cameraInput', 'drop', 'lightbox', 'lbImg', 'lbCap', 'lbClose', 'toast',
  'toutSuppr']
  .forEach((id) => { el[id] = $(id); });

const state = { convs: [], fichiers: [], convId: null, titre: '', messages: [], pending: [], busy: false, epoch: 0 };
const mqMobile = window.matchMedia('(max-width: 860px)');
const mqTactile = window.matchMedia('(pointer: coarse)');
const TAILLE_MAX = 25 * 1048576;
const PIECES_MAX = 8;

const ic = (nom, cls) => '<svg class="ic' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + nom + '"/></svg>';

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3400);
}

/* ---------- Panneau gauche ---------- */
function setSidebar(ouvert) {
  el.app.dataset.sidebar = ouvert ? 'open' : 'closed';
  el.btnMenu.setAttribute('aria-expanded', String(ouvert));
}
const sidebarOuverte = () => el.app.dataset.sidebar === 'open';
function fermerTiroir() { if (mqMobile.matches) setSidebar(false); }

el.btnMenu.addEventListener('click', () => setSidebar(!sidebarOuverte()));
el.sbClose.addEventListener('click', () => setSidebar(false));
el.scrim.addEventListener('click', () => setSidebar(false));
mqMobile.addEventListener('change', (e) => setSidebar(!e.matches));

function afficherListes() {
  el.convList.innerHTML = state.convs.length
    ? state.convs.map((c) => {
      const actif = c.id === state.convId;
      return '<li class="li-conv"><button type="button" class="item' + (actif ? ' active' : '') + '" data-id="' + esc(c.id) + '"'
        + (actif ? ' aria-current="true"' : '') + '><span class="item-ic">' + ic('chat') + '</span>'
        + '<span class="item-txt"><span class="item-title">' + esc(c.titre) + '</span>'
        + '<span class="item-sub">' + esc(dateCourte(c.date)) + '</span></span></button>'
        + '<button type="button" class="sup" data-sup="' + esc(c.id) + '" title="Supprimer cette discussion"'
        + ' aria-label="Supprimer la discussion : ' + esc(c.titre) + '">' + ic('trash') + '</button></li>';
    }).join('')
    : '<li class="empty">Aucune discussion pour le moment.</li>';

  if (el.toutSuppr) el.toutSuppr.hidden = !state.convs.length;

  el.fileList.innerHTML = state.fichiers.length
    ? state.fichiers.map((f, i) => '<li><button type="button" class="item" data-i="' + i + '">'
      + '<span class="item-thumb">' + (estImage(f) && f.url ? '<img src="' + esc(f.url) + '" alt="" loading="lazy">' : ic('file')) + '</span>'
      + '<span class="item-txt"><span class="item-title">' + esc(f.nom) + '</span>'
      + '<span class="item-sub">' + esc(extension(f.nom)) + ' · ' + esc(dateCourte(f.date)) + '</span></span></button></li>').join('')
    : '<li class="empty">Aucun fichier partagé.</li>';
}

async function rafraichirListes() {
  try {
    state.convs = await api.listerConversations();
    state.fichiers = state.convs.flatMap((c) => c.fichiers || [])
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    afficherListes();
  } catch (e) {
    toast('Impossible de charger vos discussions.');
  }
}

el.convList.addEventListener('click', (e) => {
  const sup = e.target.closest('[data-sup]');
  if (sup) { e.stopPropagation(); supprimerConversation(sup.dataset.sup); return; }
  const b = e.target.closest('[data-id]');
  if (b) choisirConversation(b.dataset.id);
});
el.toutSuppr.addEventListener('click', supprimerTout);
el.fileList.addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (b) ouvrirFichier(state.fichiers[Number(b.dataset.i)]);
});

/* ---------- Aperçu de fichier ---------- */
let lbRetour = null;
function ouvrirFichier(f) {
  if (!f) return;
  if (estImage(f) && f.url) {
    lbRetour = document.activeElement;
    el.lbImg.src = f.url;
    el.lbImg.alt = f.nom;
    el.lbCap.textContent = f.nom;
    el.lightbox.hidden = false;
    el.lbClose.focus();
  } else if (f.url) {
    window.open(f.url, '_blank', 'noopener');
  } else {
    toast('Aperçu indisponible dans cette version de démonstration.');
  }
}
function fermerApercu() {
  el.lightbox.hidden = true;
  el.lbImg.removeAttribute('src');
  if (lbRetour && lbRetour.focus) lbRetour.focus();
  lbRetour = null;
}
el.lbClose.addEventListener('click', fermerApercu);
el.lightbox.addEventListener('click', (e) => { if (e.target === el.lightbox) fermerApercu(); });

el.thread.addEventListener('click', (e) => {
  const b = e.target.closest('.att-img, .att-file');
  if (b) ouvrirFichier({ url: b.dataset.url, nom: b.dataset.nom, type: b.dataset.type });
});

/* ---------- Messages ---------- */
function htmlPiece(f) {
  const data = 'data-url="' + esc(f.url || '') + '" data-nom="' + esc(f.nom) + '" data-type="' + esc(f.type || '') + '"';
  if (estImage(f) && f.url) {
    return '<button type="button" class="att-img" ' + data + ' aria-label="Agrandir ' + esc(f.nom) + '">'
      + '<img src="' + esc(f.url) + '" alt="' + esc(f.nom) + '"></button>';
  }
  return '<button type="button" class="att-file" ' + data + '><span class="att-ic">' + ic('file') + '</span>'
    + '<span class="att-txt"><span class="att-name">' + esc(f.nom) + '</span>'
    + '<span class="att-meta">' + esc(extension(f.nom)) + (f.taille ? ' · ' + esc(tailleLisible(f.taille)) : '') + '</span></span></button>';
}

function construireMessage(msg, animer) {
  const n = document.createElement('div');
  n.className = 'msg ' + (msg.role === 'user' ? 'user' : 'argus');
  if (!animer) n.style.animation = 'none';

  if (msg.role === 'user') {
    const pieces = (msg.fichiers || []).map(htmlPiece).join('');
    n.innerHTML = '<div class="stack">' + (pieces ? '<div class="atts">' + pieces + '</div>' : '')
      + (msg.texte ? '<div class="bubble">' + esc(msg.texte) + '</div>' : '') + '</div>';
  } else {
    n.innerHTML = '<div class="avatar">' + ic('logo') + '</div><div class="body"><div class="prose">' + md(msg.texte) + '</div>'
      + '<div class="actions">'
      + (ttsOk ? '<button type="button" class="act act-speak" aria-pressed="false" aria-label="Écouter ce message">'
        + '<span class="act-ic">' + ic('speaker') + '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span></span>'
        + '<span class="act-lbl">Écouter</span></button>' : '')
      + '<button type="button" class="act act-copy" aria-label="Copier ce message">' + ic('copy') + '<span class="act-lbl">Copier</span></button>'
      + '<time class="time" datetime="' + esc(msg.date) + '">' + esc(heure(msg.date)) + '</time>'
      + '</div></div>';
    const bs = n.querySelector('.act-speak');
    if (bs) bs.addEventListener('click', () => lire(msg, bs));
    n.querySelector('.act-copy').addEventListener('click', () => copier(msg));
  }
  return n;
}

function bienvenue() {
  const w = document.createElement('div');
  w.className = 'welcome';
  w.innerHTML = '<div class="logo">' + ic('logo') + '</div><h2>Bonjour, que cherchez-vous ?</h2>'
    + '<p>Posez votre question en langage naturel. Argus vous répond avec des chiffres sourcés.</p>'
    + '<div class="suggest"></div>';
  const zone = w.querySelector('.suggest');
  ['Estimer un bien rue Garibaldi', 'Prix au m² à Lyon 3e', 'Analyser le quartier de la Croix-Rousse'].forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    b.addEventListener('click', () => {
      el.input.value = t;
      ajuster();
      majEnvoi();
      el.input.focus();
    });
    zone.appendChild(b);
  });
  return w;
}

function afficherFil() {
  arreterLecture();
  el.thread.innerHTML = '';
  const vide = !state.messages.length;
  el.thread.classList.toggle('is-empty', vide);
  if (vide) el.thread.appendChild(bienvenue());
  else state.messages.forEach((m) => el.thread.appendChild(construireMessage(m, false)));
  el.chatTitle.textContent = state.titre || 'Nouvelle discussion';
  defilerBas(false);
}

function ajouterMessage(msg) {
  if (el.thread.classList.contains('is-empty')) {
    el.thread.innerHTML = '';
    el.thread.classList.remove('is-empty');
  }
  const saisie = $('typing');
  const n = construireMessage(msg, true);
  if (saisie) el.thread.insertBefore(n, saisie); else el.thread.appendChild(n);
  defilerBas(true);
}

function afficherSaisie(on) {
  const ancien = $('typing');
  if (ancien) ancien.remove();
  if (!on) return;
  const n = document.createElement('div');
  n.className = 'msg argus';
  n.id = 'typing';
  n.innerHTML = '<div class="avatar">' + ic('logo') + '</div><div class="body"><div class="typing-line">'
    + '<span class="dots"><i></i><i></i><i></i></span><span>Argus écrit…</span></div></div>';
  el.thread.appendChild(n);
  defilerBas(true);
}

function defilerBas(doux) {
  requestAnimationFrame(() => el.messages.scrollTo({ top: el.messages.scrollHeight, behavior: doux ? 'smooth' : 'auto' }));
}

async function copier(msg) {
  const t = texteBrut(msg.texte, false);
  try {
    await navigator.clipboard.writeText(t);
    toast('Message copié');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('Message copié'); } catch (e2) { toast('Copie impossible'); }
    ta.remove();
  }
}

/* ---------- Conversations ---------- */
function reinitialiserSaisie() {
  state.pending.forEach((p) => { if (p.preview) URL.revokeObjectURL(p.preview); });
  state.pending = [];
  el.input.value = '';
  ajuster();
  afficherPieces();
  majEnvoi();
}

async function choisirConversation(id) {
  if (id === state.convId) { fermerTiroir(); return; }
  const epoch = ++state.epoch;
  state.busy = false;
  stopDictee();
  arreterLecture();
  try {
    const conv = await api.chargerConversation(id);
    if (epoch !== state.epoch) return;
    state.convId = conv.id;
    state.titre = conv.titre;
    state.messages = conv.messages;
    reinitialiserSaisie();
    afficherFil();
    afficherListes();
    fermerTiroir();
  } catch (e) {
    toast('Cette discussion est introuvable.');
  }
}

function nouvelleConversation() {
  state.epoch++;
  state.busy = false;
  stopDictee();
  arreterLecture();
  state.convId = null;
  state.titre = '';
  state.messages = [];
  reinitialiserSaisie();
  afficherFil();
  afficherListes();
  fermerTiroir();
  if (!mqTactile.matches) el.input.focus();
}
el.btnNew.addEventListener('click', nouvelleConversation);

/* ---------- Suppression de discussions ----------
   Règle : JAMAIS de suppression en un clic. On passe toujours par une
   confirmation (window.confirm) qui nomme la discussion concernée. */
async function supprimerConversation(id) {
  const c = state.convs.find((x) => x.id === id);
  const titre = c ? c.titre : 'cette discussion';
  if (!window.confirm('Supprimer définitivement « ' + titre + ' » ?\n\nCette action est irréversible.')) return;

  try {
    await api.supprimerConversation(id);
  } catch (e) {
    toast('Suppression impossible. Réessayez.');
    return;
  }

  // Si c'était la discussion ouverte, on repart sur un état neuf.
  if (state.convId === id) {
    state.epoch++;
    state.busy = false;
    stopDictee();
    arreterLecture();
    state.convId = null;
    state.titre = '';
    state.messages = [];
    reinitialiserSaisie();
    afficherFil();
  }
  await rafraichirListes();
  toast('Discussion supprimée.');
}

async function supprimerTout() {
  const n = state.convs.length;
  if (!n) return;
  if (!window.confirm('Supprimer définitivement les ' + n + ' discussions ?\n\nCette action est irréversible.')) return;

  try {
    await api.supprimerTout();
  } catch (e) {
    toast('Suppression impossible. Réessayez.');
    return;
  }
  nouvelleConversation();       // état « nouvelle discussion » propre + listes rafraîchies
  await rafraichirListes();
  toast('Toutes les discussions ont été supprimées.');
}

/* ---------- Envoi ---------- */
async function envoyer() {
  if (state.busy) return;
  const texte = el.input.value.trim();
  const items = state.pending.slice();
  if (!texte && !items.length) return;

  stopDictee();
  arreterLecture();
  state.busy = true;
  majEnvoi();
  const epoch = state.epoch;

  let refs;
  try {
    refs = await Promise.all(items.map((p) => p.promesse));
  } catch (e) {
    toast('Un fichier n\'a pas pu être envoyé. Réessayez.');
    if (epoch === state.epoch) { state.busy = false; majEnvoi(); }
    return;
  }
  if (epoch !== state.epoch) return;

  const msgUtilisateur = { id: 'm-' + uid(), role: 'user', texte, date: new Date().toISOString(), fichiers: refs };
  state.messages.push(msgUtilisateur);
  items.forEach((p) => { if (p.preview) URL.revokeObjectURL(p.preview); });
  state.pending = [];
  el.input.value = '';
  ajuster();
  afficherPieces();
  ajouterMessage(msgUtilisateur);
  afficherSaisie(true);
  majEnvoi();

  try {
    const rep = await api.envoyerMessage(texte, refs, state.convId);
    if (epoch !== state.epoch) { await rafraichirListes(); return; }
    afficherSaisie(false);
    state.convId = rep.conversationId;
    if (rep.titre) state.titre = rep.titre;
    el.chatTitle.textContent = state.titre || 'Nouvelle discussion';
    state.messages.push(rep.message);
    ajouterMessage(rep.message);
  } catch (e) {
    if (epoch === state.epoch) {
      afficherSaisie(false);
      const erreur = {
        id: 'm-' + uid(), role: 'argus', date: new Date().toISOString(), fichiers: [],
        texte: 'Désolé, je n\'ai pas pu joindre le serveur. Réessayez dans un instant.'
      };
      ajouterMessage(erreur);
    }
  } finally {
    if (epoch === state.epoch) { state.busy = false; majEnvoi(); }
  }
  await rafraichirListes();
}

el.composer.addEventListener('submit', (e) => { e.preventDefault(); envoyer(); });

/* ---------- Saisie ---------- */
function ajuster() {
  el.input.style.height = 'auto';
  el.input.style.height = Math.min(el.input.scrollHeight, 180) + 'px';
}
function majEnvoi() {
  el.btnSend.disabled = state.busy || !(el.input.value.trim() || state.pending.length);
}
el.input.addEventListener('input', () => { ajuster(); majEnvoi(); });
el.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !mqTactile.matches) {
    e.preventDefault();
    envoyer();
  }
});
el.input.addEventListener('paste', (e) => {
  const fichiers = e.clipboardData && e.clipboardData.files;
  if (fichiers && fichiers.length) { e.preventDefault(); ajouterFichiers(fichiers); }
});

/* ---------- Pièces jointes (avant envoi) ---------- */
function afficherPieces() {
  el.tray.hidden = !state.pending.length;
  el.tray.innerHTML = state.pending.map((p) => {
    const img = p.file.type.startsWith('image/') && p.preview;
    return '<div class="chip' + (p.ref ? '' : ' loading') + '"><span class="thumb">'
      + (img ? '<img src="' + esc(p.preview) + '" alt="">' : ic('file')) + '</span>'
      + '<span class="chip-txt"><span class="chip-name">' + esc(p.file.name) + '</span>'
      + '<span class="chip-meta">' + esc(tailleLisible(p.file.size)) + '</span></span>'
      + '<button type="button" class="x" data-id="' + p.id + '" aria-label="Retirer ' + esc(p.file.name) + '">' + ic('close') + '</button></div>';
  }).join('');
}

function retirerPiece(id) {
  const p = state.pending.find((x) => x.id === id);
  if (p && p.preview) URL.revokeObjectURL(p.preview);
  state.pending = state.pending.filter((x) => x.id !== id);
  afficherPieces();
  majEnvoi();
}
el.tray.addEventListener('click', (e) => {
  const b = e.target.closest('.x');
  if (b) retirerPiece(b.dataset.id);
});

function ajouterFichiers(liste) {
  Array.from(liste).forEach((f) => {
    if (state.pending.length >= PIECES_MAX) { toast(PIECES_MAX + ' fichiers maximum par message.'); return; }
    if (f.size > TAILLE_MAX) { toast('« ' + f.name + ' » dépasse 25 Mo.'); return; }
    const item = {
      id: uid(), file: f, ref: null,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null
    };
    item.promesse = api.uploaderFichier(f).then((ref) => {
      item.ref = ref;
      afficherPieces();
      return ref;
    }).catch((err) => {
      retirerPiece(item.id);
      toast('« ' + f.name + ' » n\'a pas pu être ajouté.');
      throw err;
    });
    item.promesse.catch(() => {});
    state.pending.push(item);
  });
  afficherPieces();
  majEnvoi();
}

/* Menu « + » */
function menuPlus(ouvrir) {
  el.plusMenu.hidden = !ouvrir;
  el.btnPlus.setAttribute('aria-expanded', String(ouvrir));
}
el.btnPlus.addEventListener('click', () => menuPlus(el.plusMenu.hidden));
el.miFile.addEventListener('click', () => { menuPlus(false); el.fileInput.click(); });
el.miCamera.addEventListener('click', () => { menuPlus(false); el.cameraInput.click(); });
[el.fileInput, el.cameraInput].forEach((inp) => inp.addEventListener('change', () => {
  if (inp.files && inp.files.length) ajouterFichiers(inp.files);
  inp.value = '';
}));
document.addEventListener('click', (e) => {
  if (!el.plusMenu.hidden && !e.target.closest('.plus-wrap')) menuPlus(false);
});

/* Glisser-déposer */
let glisse = 0;
const aDesFichiers = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
window.addEventListener('dragenter', (e) => { if (aDesFichiers(e)) { glisse++; el.drop.hidden = false; } });
window.addEventListener('dragover', (e) => { if (aDesFichiers(e)) e.preventDefault(); });
window.addEventListener('dragleave', (e) => {
  if (aDesFichiers(e)) { glisse = Math.max(0, glisse - 1); if (!glisse) el.drop.hidden = true; }
});
window.addEventListener('drop', (e) => {
  if (!aDesFichiers(e)) return;
  e.preventDefault();
  glisse = 0;
  el.drop.hidden = true;
  if (e.dataTransfer.files.length) ajouterFichiers(e.dataTransfer.files);
});

/* ---------- Lecture vocale (TTS) ---------- */
const ttsOk = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
const tts = { jeton: 0, btn: null };

function choisirVoix() {
  const fr = speechSynthesis.getVoices().filter((v) => /^fr/i.test(v.lang));
  if (!fr.length) return null;
  const frFR = fr.filter((v) => /^fr[-_]FR/i.test(v.lang));
  return frFR.find((v) => /natural|neural|premium|enhanced|google|thomas|am[ée]lie|audrey|marie/i.test(v.name))
    || frFR[0] || fr[0];
}

function majBoutonLecture(btn, actif) {
  if (!btn) return;
  btn.classList.toggle('is-on', actif);
  btn.setAttribute('aria-pressed', String(actif));
  btn.setAttribute('aria-label', actif ? 'Arrêter la lecture' : 'Écouter ce message');
  const l = btn.querySelector('.act-lbl');
  if (l) l.textContent = actif ? 'Arrêter' : 'Écouter';
}

function arreterLecture() {
  if (!ttsOk) return;
  tts.jeton++;
  speechSynthesis.cancel();
  majBoutonLecture(tts.btn, false);
  tts.btn = null;
}

function finirLecture(jeton) {
  if (jeton !== tts.jeton) return;
  majBoutonLecture(tts.btn, false);
  tts.btn = null;
}

function lire(msg, btn) {
  if (!ttsOk) return;
  if (tts.btn === btn) { arreterLecture(); return; }
  stopDictee();
  arreterLecture();
  const morceaux = decouper(texteParle(msg.texte));
  if (!morceaux.length) return;
  const jeton = ++tts.jeton;
  tts.btn = btn;
  majBoutonLecture(btn, true);
  const voix = choisirVoix();

  const suivant = (i) => {
    if (jeton !== tts.jeton) return;
    if (i >= morceaux.length) { finirLecture(jeton); return; }
    const u = new SpeechSynthesisUtterance(morceaux[i]);
    u.lang = 'fr-FR';
    if (voix) u.voice = voix;
    u.rate = 1;
    u.pitch = 1;
    u.onend = () => suivant(i + 1);
    u.onerror = (ev) => {
      if (jeton !== tts.jeton) return;
      if (ev.error === 'interrupted' || ev.error === 'canceled') return;
      finirLecture(jeton);
      toast('La lecture vocale a échoué.');
    };
    speechSynthesis.speak(u);
  };
  setTimeout(() => { speechSynthesis.resume(); suivant(0); }, 60);
}
if (ttsOk) {
  speechSynthesis.getVoices();
  window.addEventListener('pagehide', () => speechSynthesis.cancel());
}

/* ---------- Dictée vocale (STT) ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const estAndroid = /android/i.test(navigator.userAgent);
const stt = { rec: null, actif: false, base: '', silences: 0 };
const PLACEHOLDER = el.input.getAttribute('placeholder');

function majMicro(on) {
  el.btnMic.classList.toggle('on', on);
  el.btnMic.setAttribute('aria-pressed', String(on));
  el.btnMic.setAttribute('aria-label', on ? 'Arrêter la dictée' : 'Dicter un message');
  el.input.setAttribute('placeholder', on ? 'Je vous écoute… parlez maintenant' : PLACEHOLDER);
}

function baseDepuisChamp() {
  const v = el.input.value.replace(/\s+$/, '');
  return v ? v + ' ' : '';
}

function stopDictee() {
  stt.actif = false;
  const r = stt.rec;
  stt.rec = null;
  if (r) { try { r.stop(); } catch (e) { /* déjà arrêtée */ } }
  majMicro(false);
}

function demarrerSession() {
  const rec = new SR();
  stt.rec = rec;
  rec.lang = 'fr-FR';
  rec.interimResults = true;
  rec.continuous = !estAndroid;
  rec.maxAlternatives = 1;

  rec.onresult = (e) => {
    stt.silences = 0;
    let finals = '';
    let interim = '';
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finals += r[0].transcript; else interim += r[0].transcript;
    }
    el.input.value = stt.base + finals + interim;
    ajuster();
    majEnvoi();
  };

  rec.onerror = (e) => {
    if (e.error === 'no-speech') {
      if (++stt.silences >= 2) { toast('Aucune voix détectée.'); stopDictee(); }
      return;
    }
    if (e.error === 'aborted') return;
    const messages = {
      'not-allowed': 'Autorisez l\'accès au micro dans votre navigateur pour dicter.',
      'service-not-allowed': 'Autorisez l\'accès au micro dans votre navigateur pour dicter.',
      'audio-capture': 'Aucun micro détecté.',
      'network': 'La dictée vocale nécessite une connexion internet.'
    };
    toast(messages[e.error] || 'La dictée vocale a rencontré un problème.');
    stopDictee();
  };

  rec.onend = () => {
    if (rec !== stt.rec) return;
    if (stt.actif) {
      // Sur Android, `continuous` est ignoré : la session se coupe à chaque
      // silence. On la relance APRÈS une micro-pause, sinon Chrome lève
      // « InvalidStateError: already started » et la dictée meurt en silence.
      stt.base = baseDepuisChamp();
      setTimeout(() => {
        if (stt.actif && rec === stt.rec) {
          try { demarrerSession(); } catch (e) { stopDictee(); }
        }
      }, 250);
    } else {
      majMicro(false);
    }
  };

  rec.start();
}

/* Demande EXPLICITE d'accès au micro avant de dicter.
   Sur mobile, lancer SpeechRecognition sans autorisation préalable donne
   souvent une erreur muette : on réclame d'abord le micro, ce qui affiche
   le prompt du navigateur, puis on démarre la reconnaissance. */
async function demanderMicro() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return true;
  try {
    const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
    // On n'enregistre pas : on libère tout de suite le micro pour la dictée.
    flux.getTracks().forEach((t) => t.stop());
    return true;
  } catch (e) {
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
      toast('Autorisez l\'accès au micro pour dicter. (Réglages du navigateur → Micro)');
    } else if (e && e.name === 'NotFoundError') {
      toast('Aucun micro détecté sur cet appareil.');
    } else {
      toast('Le micro n\'a pas pu être ouvert.');
    }
    return false;
  }
}

async function demarrerDictee() {
  arreterLecture();
  stt.actif = true;
  stt.silences = 0;
  stt.base = baseDepuisChamp();
  majMicro(true);
  const ok = await demanderMicro();
  if (!ok) { stopDictee(); return; }
  if (!stt.actif) return;              // l'utilisateur a coupé entre-temps
  try { demarrerSession(); } catch (e) { stopDictee(); toast('La dictée vocale n\'a pas pu démarrer.'); }
}

el.btnMic.addEventListener('click', () => {
  if (!SR) {
    toast('La dictée vocale n\'est pas disponible sur ce navigateur. Essayez Chrome, Edge ou Safari.');
    return;
  }
  if (stt.actif) stopDictee(); else demarrerDictee();
});

/* ---------- Raccourcis clavier ---------- */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!el.lightbox.hidden) fermerApercu();
  else if (!el.plusMenu.hidden) menuPlus(false);
  else if (mqMobile.matches && sidebarOuverte()) setSidebar(false);
});

/* ---------- Démarrage ---------- */
async function init() {
  el.demoPill.hidden = !api.simule;
  setSidebar(!mqMobile.matches);
  ajuster();
  majEnvoi();
  await rafraichirListes();
  const params = new URLSearchParams(location.search);
  if (params.get('nouveau') === '1') {
    afficherFil();                       // raccourci PWA « Nouvelle discussion »
  } else if (state.convs.length) {
    await choisirConversation(state.convs[0].id);
  } else {
    afficherFil();
  }
}
init();

/* ==========================================================
   PWA — installation de l'application
   Enregistre le service worker ; propose « Installer » si le
   navigateur le permet (Chrome/Edge/Android). Sur iOS, c'est
   via Partager → « Sur l'écran d'accueil ».
   ========================================================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors-ligne indisponible */ });
  });
}

let inviteInstallation = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  inviteInstallation = e;
  if (document.getElementById('btnInstaller')) return;
  const b = document.createElement('button');
  b.id = 'btnInstaller';
  b.type = 'button';
  b.className = 'pill install';
  b.textContent = 'Installer';
  b.title = "Installer Argus sur l'appareil";
  b.style.cursor = 'pointer';
  b.addEventListener('click', async () => {
    b.remove();
    if (inviteInstallation) { inviteInstallation.prompt(); inviteInstallation = null; }
  });
  const barre = document.querySelector('.topbar');
  if (barre) barre.appendChild(b);
});

window.addEventListener('appinstalled', () => {
  const b = document.getElementById('btnInstaller');
  if (b) b.remove();
  toast('Argus est installé sur votre appareil.');
});

/* ==========================================================
   NOTIFICATIONS DE VEILLE
   Lit /api/notifications (magasin partagé argus-notifs), affiche
   le badge des non-lues, et permet de marquer comme lu.
   L'agent, lui, répond aussi à « quelles notifications ? » via sa
   skill notifications-alertes (voir cerveau argus).
   ========================================================== */
const notif = {
  ouvert: false,
  filtre: '',
  data: [],
  resume: { total: 0, non_lues: 0 }
};

const LIB_TYPE = { annonce: 'Annonce', marche: 'Baisse', vente: 'Vente', alerte: 'Alerte', systeme: 'Système' };

async function chargerNotifs() {
  try {
    const rep = await fetch('/api/notifications?limite=80');
    if (!rep.ok) throw new Error('Erreur ' + rep.status);
    const d = await rep.json();
    notif.data = d.notifications || [];
    notif.resume = d.resume || { total: 0, non_lues: 0 };
    majBadge();
    if (notif.ouvert) afficherNotifs();
  } catch (e) {
    majBadge(0);
  }
}

function majBadge(n) {
  const b = document.getElementById('notifBadge');
  const v = typeof n === 'number' ? n : (notif.resume.non_lues || 0);
  if (b) {
    if (v > 0) { b.textContent = v > 99 ? '99+' : String(v); b.hidden = false; }
    else { b.hidden = true; }
  }
  majBadgeApp(v);
}

/* Badge de l'icône installée (PWA). Badging API : Chrome/Android, Edge,
   Safari iOS récents. Absente ailleurs -> on ne fait rien (aucune erreur). */
function majBadgeApp(v) {
  if (!('setAppBadge' in navigator)) return;
  try {
    if (v > 0) { const p = navigator.setAppBadge(v); if (p && p.catch) p.catch(() => {}); }
    else { const p = navigator.clearAppBadge(); if (p && p.catch) p.catch(() => {}); }
  } catch (e) { /* API présente mais refusée (permission, contexte) : on ignore */ }
}

function afficherNotifs() {
  const liste = document.getElementById('npListe');
  const compte = document.getElementById('npCount');
  if (!liste) return;
  const vues = notif.filtre ? notif.data.filter((x) => x.type === notif.filtre) : notif.data;
  compte.textContent = notif.resume.non_lues > 0
    ? notif.resume.non_lues + ' non lue' + (notif.resume.non_lues > 1 ? 's' : '')
    : notif.resume.total + ' au total';

  if (!vues.length) {
    liste.innerHTML = '<div class="np-vide">' + (notif.filtre
      ? 'Aucune notification dans cette catégorie.'
      : 'Aucune notification pour le moment.<br>Lancez une recherche : Argus vous préviendra des nouveautés.') + '</div>';
    return;
  }

  liste.innerHTML = vues.map((x) => {
    const cls = ['np-item'];
    if (!x.lu) cls.push('non-lu');
    if (x.severite === 'important' || x.severite === 'urgent') cls.push('sev-' + x.severite);
    const t = LIB_TYPE[x.type] || x.type || 'Info';
    const lien = x.donnees && (x.donnees.url_annonce || x.donnees.url);
    const date = x.cree_le ? heureNotif(x.cree_le) : '';
    return '<div class="' + cls.join(' ') + '" data-id="' + esc(x.id) + '">'
      + '<div class="np-tete">'
      + '<span class="np-type ' + esc(x.type || '') + '">' + esc(t) + '</span>'
      + (x.severite === 'urgent' ? '<span class="np-non-lu-dot" style="background:#C0392B"></span>' : '')
      + '<span class="np-src">' + esc(x.source || '') + '</span>'
      + '</div>'
      + '<div class="np-titre">' + esc(x.titre || '') + '</div>'
      + (x.corps ? '<div class="np-corps">' + esc(x.corps) + '</div>' : '')
      + '<div class="np-pied">'
      + '<span>' + esc(date) + '</span>'
      + (lien ? '<a class="np-lien" href="' + esc(lien) + '" target="_blank" rel="noopener">Voir l\'annonce</a>' : '')
      + (x.lu ? '' : '<button type="button" class="np-marquer" data-lu="' + esc(x.id) + '" style="margin-left:auto;background:none;border:0;color:var(--accent-text);font-weight:600;cursor:pointer;font-size:.74rem;font-family:inherit">Marquer lu</button>')
      + '</div></div>';
  }).join('');
}

function heureNotif(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return dateCourte(iso) + ' · ' + fmtHeure.format(d);
  } catch (e) { return iso; }
}

function ouvrirNotifs(ouvert) {
  const p = document.getElementById('notifPanel');
  const s = document.getElementById('notifScrim');
  const b = document.getElementById('btnNotifs');
  if (!p) return;
  notif.ouvert = ouvert;
  if (ouvert) {
    p.hidden = false;
    requestAnimationFrame(() => p.classList.add('ouvert'));
    if (s) { s.hidden = false; requestAnimationFrame(() => s.classList.add('show')); }
    b.setAttribute('aria-expanded', 'true');
    afficherNotifs();
    chargerNotifs();
  } else {
    p.classList.remove('ouvert');
    if (s) s.classList.remove('show');
    b.setAttribute('aria-expanded', 'false');
    setTimeout(() => { p.hidden = true; if (s) s.hidden = true; }, 340);
  }
}

async function marquerLu(ids, tous) {
  try {
    const rep = await fetch('/api/notifications/lire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tous ? { tous: true } : { ids: ids || [] })
    });
    if (!rep.ok) throw new Error('Erreur ' + rep.status);
    await chargerNotifs();
  } catch (e) {
    toast('Impossible de mettre à jour les notifications.');
  }
}

/* --- Écouteurs du panneau --- */
(function brancherNotifs() {
  const btn = document.getElementById('btnNotifs');
  if (!btn) return;
  btn.addEventListener('click', () => ouvrirNotifs(!notif.ouvert));
  document.getElementById('npClose').addEventListener('click', () => ouvrirNotifs(false));
  document.getElementById('notifScrim').addEventListener('click', () => ouvrirNotifs(false));
  document.getElementById('npRefresh').addEventListener('click', chargerNotifs);
  document.getElementById('npToutLu').addEventListener('click', () => marquerLu(null, true));

  // « Demander à Argus » : pose la question dans le chat (l'agent a la skill).
  document.getElementById('npDemander').addEventListener('click', () => {
    ouvrirNotifs(false);
    const champ = document.getElementById('input');
    if (!champ) return;
    champ.value = 'Quelles sont les dernières notifications reçues ? Résume-les par type en citant la source et la date.';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    if (el.composer) el.composer.requestSubmit();
  });

  document.getElementById('npFiltres').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    notif.filtre = c.dataset.filtre || '';
    document.querySelectorAll('#npFiltres .chip').forEach((x) => x.classList.toggle('actif', x === c));
    afficherNotifs();
  });

  document.getElementById('npListe').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lu]');
    if (b) marquerLu([b.dataset.lu], false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && notif.ouvert) ouvrirNotifs(false);
  });

  // Rafraîchit le badge toutes les 60 s (nouvelles notifs de la veille).
  chargerNotifs();
  setInterval(chargerNotifs, 60000);
})();
