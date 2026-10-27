/* Sciamn — logica pura (nessun DOM, nessun fetch): testabile da Node, riusata dal browser. */
(function (root, factory) {
  // CONFIG (atenei) e CATALOGO (calendari dei corsi, generato) vivono in config.js e catalogo.js,
  // caricati prima di questo file nel browser e richiesti qui in Node: stessi dati per app e test.
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./config.js'), require('./catalogo.js'));
  else root.Core = factory(root.UniPlannerConfig, root.UniPlannerCatalogo || { calendari: [] });
})(typeof self !== 'undefined' ? self : this, function (CONFIG, CATALOGO) {
  'use strict';

  const TIPI = {
    LEZ: { label: 'Lezione', sigla: 'LEZ' },
    ESE: { label: 'Esercitazione', sigla: 'ESE' },
    LAB: { label: 'Laboratorio', sigla: 'LAB' }
  };

  /* ---------- date (sempre locali: l'app vive in Italia) ---------- */

  const pad = (n) => String(n).padStart(2, '0');

  function dayKey(d) {
    const x = d instanceof Date ? d : new Date(d);
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
  }

  function parseDayKey(k) {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }

  // Lunedì della settimana che contiene d, alle 00:00 locali.
  function startOfWeek(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return addDays(x, -((x.getDay() + 6) % 7));
  }

  function fmtTime(iso) {
    const d = new Date(iso);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // Giorni/mesi abbreviati in italiano, indicizzati come getDay()/getMonth() (0 = domenica / gennaio).
  const GIORNI_ABBR = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const MESI_ABBR = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  // Sono l'unica copia dei nomi brevi: core.js non può importare app/date.js (modulo ES), i moduli ES li
  // leggono da qui attraverso C. "28 set"; la settimana "28 set — 4 ott 2026" (l'anno solo della fine).
  const dataBreve = (d) => d.getDate() + ' ' + MESI_ABBR[d.getMonth()];
  const fmtSettimana = (inizio) => {
    const fine = addDays(inizio, 6);
    return dataBreve(inizio) + ' — ' + dataBreve(fine) + ' ' + fine.getFullYear();
  };

  // Singolare con 1, plurale con tutto il resto (0 compreso): "1 lezione", "0 lezioni", "2 lezioni".
  // Solo la parola: il numero lo scrive chi chiama, che a volte non è il solo numero ("Primi 5 di 12").
  const plurale = (n, singolare, plurali) => (n === 1 ? singolare : plurali);

  /* ---------- corsi e calendari ---------- */

  // Un "calendario" è un link pubblico Cineca UP: per UniBA di solito un corso intero, per il
  // Politecnico un corso + anno (+ gruppo di cognomi o percorso). Chiavi:
  //   'uniba:7749', 'poliba:LT17::2:cognome-a-l'  → voce del catalogo (stabili tra un anno e l'altro)
  //   'itps', 'informatica'                         → chiavi fino alla 1.2.x, via CONFIG.alias
  //   'link:uniba:<linkCalendarioId>'               → link incollato dall'utente (corso non in catalogo)
  const PER_CHIAVE = new Map((CATALOGO.calendari || []).map((c) => [c.k, c]));
  const LINK_RE = /^link:([a-z]+):([0-9a-f]{24})$/;
  const own = (o, k) => Object.hasOwn(o, k);

  function chiaveCorso(key) {
    return key && own(CONFIG.alias, key) ? CONFIG.alias[key] : key;
  }

  // Tutto quello che serve di un calendario, o null se la chiave non porta a niente (voce tolta dal
  // catalogo, ateneo sconosciuto). `personali` = { chiave: { n } } per i link incollati.
  function calendario(key, personali) {
    const k = chiaveCorso(key);
    if (!k || typeof k !== 'string') return null;
    const c = PER_CHIAVE.get(k);
    if (c) return { ...c };
    const m = LINK_RE.exec(k);
    if (m && own(CONFIG.atenei, m[1])) {
      const p = personali && own(personali, k) ? personali[k] : null;
      return { k, a: m[1], l: m[2], n: (p && p.n) || 'Calendario personalizzato', personale: true };
    }
    return null;
  }

  // Calendari risolti (alias → catalogo), senza doppioni e senza chiavi morte, nell'ordine dato.
  function calendariValidi(keys, personali) {
    const out = [];
    for (const key of keys || []) {
      const c = calendario(key, personali);
      if (c && !out.some((x) => x.k === c.k)) out.push(c);
    }
    return out;
  }

  // "Ingegneria informatica e dell'automazione · 2° anno · Cognome A-L"
  function etichettaCalendario(c) {
    if (!c) return '';
    return [c.n, c.s, c.y && c.y + '° anno', c.g].filter(Boolean).join(' · ');
  }

  // Link incollato dall'utente (URL del calendario pubblico, anche con il "//" doppio delle pagine
  // del Politecnico) → { a, l }. Un id nudo vale per `ateneoDefault`. null se non è un link UP di
  // un ateneo che conosciamo (di un altro ateneo non sapremmo host e clienteId).
  function parseLinkCalendario(text, ateneoDefault) {
    const t = String(text || '').trim();
    const id = (/linkCalendarioId=([0-9a-f]{24})/i.exec(t) || [])[1] || (/^[0-9a-f]{24}$/i.test(t) ? t : null);
    if (!id) return null;
    const host = (/^https?:\/\/([^\/?#]+)/i.exec(t) || [])[1];
    let a = null;
    if (host) {
      for (const k of Object.keys(CONFIG.atenei)) if (CONFIG.atenei[k].host === host.toLowerCase()) a = k;
    } else if (ateneoDefault && own(CONFIG.atenei, ateneoDefault)) a = ateneoDefault;
    return a ? { a, l: id.toLowerCase() } : null;
  }

  const senzaAccenti = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Distanza di modifica con scambio di lettere vicine ("infromatica" è a 1 da "informatica").
  function distanza(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  // La parola cercata compare nel testo, anche con un refuso? Si confronta con ogni parola del testo
  // e col suo inizio della stessa lunghezza (si scrive "infor" prima di "informatica"). Tolleranza:
  // niente sotto le 4 lettere, 1 errore fino a 6, 2 oltre; mai sulle cifre (i codici corso).
  function parolaTrovata(w, tokens) {
    const tol = /\d/.test(w) || w.length < 4 ? 0 : w.length <= 6 ? 1 : 2;
    if (!tol) return false;
    return tokens.some((t) => Math.abs(t.length - w.length) <= tol + 4 && Math.min(distanza(w, t), distanza(w, t.slice(0, w.length))) <= tol);
  }

  // Dipartimento (UniBA e Poliba) e pagina UniBA di un corso (CATALOGO.pag, chiave = voce senza anno né
  // gruppo): 'uniba:7749', 'uniba:8174TA:taranto', 'poliba:LT17'. Un corso senza dati non ha dipartimento.
  const chiaveVoce = (k) => String(k).split(':').slice(0, 3).join(':').replace(/:+$/, '');
  const DIPARTIMENTI = CATALOGO.dip || [];
  const PAGINE = CATALOGO.pag || {};

  const TIPI_ORDINE = ['Triennale', 'Magistrale', 'Ciclo unico', 'Professionalizzante'];

  // I tipi di corso che l'ateneo ha davvero (per i filtri), nell'ordine di TIPI_ORDINE.
  function tipiCorsi(ateneo) {
    const ci = new Set((CATALOGO.calendari || []).filter((c) => c.a === ateneo && c.t).map((c) => c.t));
    return TIPI_ORDINE.filter((t) => ci.has(t));
  }

  // Indici in DIPARTIMENTI dei dipartimenti che hanno almeno un corso dell'ateneo (l'elenco è unico per
  // UniBA e Poliba, il filtro mostra solo quelli dell'ateneo scelto).
  function dipartimentiCorsi(ateneo) {
    const ci = new Set();
    for (const c of CATALOGO.calendari || []) {
      const p = c.a === ateneo && PAGINE[chiaveVoce(c.k)];
      if (p) ci.add(p[0]);
    }
    return DIPARTIMENTI.map((_, i) => i).filter((i) => ci.has(i));
  }

  // Corsi del catalogo (un corso = le sue varianti per anno/gruppo), per ateneo, tipo e ricerca. Ogni
  // parola cercata deve comparire in nome, tipo, sede o codice ("ing inf" trova Ingegneria
  // informatica), anche con un refuso; chi la contiene giusta viene prima di chi la contiene sbagliata.
  // Ordine alfabetico; a pari nome prima Bari, poi le altre sedi. Con una ricerca il chiamante non
  // passa ateneo e tipo: cercare scavalca i filtri.
  function cercaCorsi(query, ateneo, tipo, dip) {
    const words = senzaAccenti(query).split(/[^a-z0-9]+/).filter(Boolean);
    const gruppi = new Map();
    for (const c of CATALOGO.calendari || []) {
      if (ateneo && c.a !== ateneo) continue;
      if (tipo && (c.t || '') !== tipo) continue;
      const pagina = PAGINE[chiaveVoce(c.k)];
      if (dip != null && dip !== '' && (!pagina || pagina[0] !== Number(dip))) continue;
      const g = [c.a, c.n, c.t || '', c.s || ''].join('|');
      if (!gruppi.has(g)) gruppi.set(g, { id: g, a: c.a, n: c.n, t: c.t || '', s: c.s || '', d: pagina ? pagina[0] : -1, u: (pagina && pagina[1]) || '', varianti: [] });
      gruppi.get(g).varianti.push(c);
    }
    const out = [];
    for (const g of gruppi.values()) {
      const hay = senzaAccenti([g.n, g.t, g.s, g.varianti[0].k.split(':')[1]].join(' '));
      const tokens = hay.split(/[^a-z0-9]+/).filter(Boolean);
      let refusi = 0;
      const tutte = words.every((w) => {
        if (hay.includes(w)) return true;
        if (!parolaTrovata(w, tokens)) return false;
        refusi++;
        return true;
      });
      if (tutte) { g.approssimato = refusi > 0; out.push(g); }
    }
    return out.sort((x, y) => (x.approssimato ? 1 : 0) - (y.approssimato ? 1 : 0) || x.n.localeCompare(y.n, 'it') || (x.s ? 1 : 0) - (y.s ? 1 : 0) || x.s.localeCompare(y.s) || x.t.localeCompare(y.t));
  }

  // Nella scelta del corso si vedono solo i primi MAX_RISULTATI gruppi di cercaCorsi: per gli altri si
  // cerca o si stringe coi filtri. Il conto dice quanto è lunga la lista vera (e che la ricerca guarda
  // dappertutto); se nessun nome combacia giusto, i risultati sono quelli più somiglianti.
  const MAX_RISULTATI = 5;
  // "Primi 5 di 12" quando la lista è tagliata, altrimenti solo il numero
  const quantiScelta = (n) => (n > MAX_RISULTATI ? 'Primi ' + MAX_RISULTATI + ' di ' + n : String(n));

  function contoRicerca(gruppi) {
    const n = gruppi.length;
    return quantiScelta(n) + ' ' + plurale(n, 'risultato', 'risultati') + ' in tutti i corsi' +
      (gruppi.every((g) => g.approssimato) ? ' · nomi simili' : '');
  }

  function contoCorsi(n) {
    return quantiScelta(n) + ' ' + plurale(n, 'corso', 'corsi') + (n > MAX_RISULTATI ? ' · cerca o filtra per vederne altri' : '');
  }

  function risultatiScelta(gruppi, cerca) {
    if (!gruppi.length) return { conto: 'Nessun corso trovato. Se il tuo pubblica l\'orario su Cineca, incolla il link qui sotto.', gruppi: [] };
    return { conto: cerca ? contoRicerca(gruppi) : contoCorsi(gruppi.length), gruppi: gruppi.slice(0, MAX_RISULTATI) };
  }

  // Anni da filtrare appena scelti i calendari. Un calendario di un anno solo contiene già solo
  // quello (col filtro "1° anno" di default un calendario del 2° sembrerebbe vuoto); uno di tutto
  // il corso parte dal 1°. [] = nessun filtro.
  // Pagina del corso sul sito UniBA, o '' se non la conosciamo.
  const paginaCorso = (g) => (g && g.u ? 'https://www.uniba.it/it/corsi/' + g.u : '');

  function anniPerCalendari(cals) {
    if (cals.length && cals.every((c) => c.y)) return Array.from(new Set(cals.map((c) => c.y))).sort((a, b) => a - b);
    return [1];
  }

  const endpoint = (ateneo) => 'https://' + CONFIG.atenei[ateneo].host + '/api/Impegni/getImpegniCalendarioPubblico';

  /* ---------- richiesta all'API ---------- */

  // La settimana che contiene weekStart: lunedì 00:00 → domenica 23:59:59.999 locali, in ISO.
  // Nota: costruisce sempre nuovi Date, non muta l'argomento (nel doc originale
  // moment().startOf/endOf modificavano le date dello stato).
  function intervalloSettimana(weekStart) {
    const from = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 0, 0, 0, 0);
    const last = addDays(from, 6);
    const to = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999);
    return { da: from.toISOString(), a: to.toISOString() };
  }

  function buildRequestBody(weekStart, cal) {
    const r = intervalloSettimana(weekStart);
    return {
      mostraImpegniAnnullati: true,
      mostraIndisponibilitaTotali: true,
      filtroSfondoId: null,
      linkCalendarioId: cal.l,
      clienteId: CONFIG.atenei[cal.a].clienteId,
      pianificazioneTemplate: false,
      dataInizio: r.da,
      dataFine: r.a
    };
  }

  /* ---------- nuova API pubblica (UniBA, docs/cineca-nuova.md) ---------- */

  // Oltre questo numero di risultati Cineca tronca in silenzio, e non per data (ordina per id).
  const TETTO_PUBBLICA = 150;

  // Le lezioni di un corso, per id. Mai annoCorso: perderebbe le lezioni con l'anno nullo
  // (calendari con anniCorso [2, "assente"]); l'anno lo filtra l'app.
  function urlPubblico(ateneo, corsoId, r) {
    return 'https://' + CONFIG.atenei[ateneo].hostPubblico + '/api/Impegni/getImpegniPublic?ricerca=attivitaDidattica&corso=' +
      encodeURIComponent(corsoId) + '&dataInizio=' + encodeURIComponent(r.da) + '&dataFine=' + encodeURIComponent(r.a);
  }

  // Il piano di un'aula: la nuova API non lo mette nell'evento.
  function urlAula(ateneo, aulaId) {
    return 'https://' + CONFIG.atenei[ateneo].hostPubblico + '/api/Aule/getByIdPublic?id=' + encodeURIComponent(aulaId);
  }

  // Le due metà di un intervallo, per richiedere di nuovo quando una risposta tocca il tetto.
  function dimezza(r) {
    const m = new Date((new Date(r.da).getTime() + new Date(r.a).getTime()) / 2).toISOString();
    return [{ da: r.da, a: m }, { da: m, a: r.a }];
  }

  // Aule delle risposte grezze di cui non si conosce ancora il piano.
  function auleDaChiedere(raws, piani) {
    const ids = new Set();
    for (const raw of raws || []) for (const a of (raw && raw.aule) || []) if (a.id && !own(piani || {}, a.id)) ids.add(a.id);
    return Array.from(ids);
  }

  // La nuova API scarica tutto il corso (l'anno non si chiede, vedi urlPubblico): un calendario di un
  // anno tiene quell'anno e le lezioni senza anno, così due calendari di anni diversi non si mescolano.
  function eventiDelCalendario(events, cal) {
    return cal && cal.y ? events.filter((e) => e.anno === cal.y || e.anno == null) : events;
  }

  // Lezioni della copia salvata che nella risposta nuova non ci sono più.
  function sparite(prev, next) {
    const ora = new Set((next || []).map((e) => e.id));
    return (prev || []).filter((e) => !ora.has(e.id));
  }

  // Id da ricontrollare sulla vecchia API: le sparite che non erano già sospese (quelle si riportano
  // dalla copia salvata, senza rifare la richiesta a ogni aggiornamento).
  function daRicontrollare(prev, next) {
    return sparite(prev, next).filter((e) => !e.sospesa).map((e) => e.id);
  }

  // Le sospese la nuova API non le manda. Tornano nell'orario: quelle già viste sospese, e quelle che
  // la vecchia (`vecchie`) dà come sospese, così il diff dice "annullata" invece di "rimossa".
  // `vecchie` null = vecchia irraggiungibile: le sparite restano com'erano, meglio una lezione in più
  // per un aggiornamento che una notifica "rimossa" sbagliata e la lezione persa per sempre.
  function conSospese(events, prev, vecchie) {
    const via = sparite(prev, events);
    const daVecchia = new Map((vecchie || []).filter((e) => e.sospesa).map((e) => [e.id, e]));
    const tornano = via.filter((e) => e.sospesa || vecchie === null || daVecchia.has(e.id)).map((e) => (!e.sospesa && daVecchia.get(e.id)) || e);
    return mergeEvents([events, tornano]);
  }

  /* ---------- normalizzazione ---------- */

  const VOCALI_ACCENTATE = { A: 'à', E: 'è', I: 'ì', O: 'ò', U: 'ù' };

  // "MODELLI E METODI PER LA QUALITA' DEL SOFTWARE" -> "Modelli e metodi per la qualità del software"
  function prettyName(s) {
    if (!s) return '';
    let t = String(s).trim().toLowerCase();
    // vocale + apostrofo a fine parola = accento scritto male ("qualita'")
    t = t.replace(/([aeiou])'(?=\s|$|[^a-zà-ÿ])/g, (_, v) => VOCALI_ACCENTATE[v.toUpperCase()]);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function titleCase(s) {
    return String(s || '').trim().toLowerCase().replace(/(^|[\s'-])([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase());
  }

  // "Iniziali cognome A-K" -> "A-K"
  function cleanPartizione(text) {
    return String(text || '').replace(/Iniziali cognome\s*/i, '').trim();
  }

  function uniq(arr) {
    return Array.from(new Set(arr.filter(Boolean)));
  }

  // Indirizzi (curricula/percorsi) di una lista di dettagli didattici, senza i comuni: un
  // insegnamento del piano comune (percorso "PDS0…" o "COMUNE") non appartiene a un indirizzo.
  // Nomi come gli altri testi (prettyName), senza doppioni.
  function indirizziDa(dettagli) {
    const out = [];
    for (const d of dettagli || []) {
      const p = d && d.percorso;
      if (!p) continue;
      if (/^PDS0/i.test(String(p.codice || ''))) continue;
      if (/^comune$/i.test(String(p.descrizione || '').replace(/\s+/g, ''))) continue;
      const nome = prettyName(p.descrizione);
      if (nome && !out.includes(nome)) out.push(nome);
    }
    return out;
  }

  // Parte comune ai due normalizzatori (vecchia e nuova API): tutto ciò che si ricava allo stesso modo
  // dalla risposta grezza. `campi` porta le differenze (id, codice, nome, anno, tipo, partizioni,
  // indirizzi, luoghi), che le due API espongono in punti diversi.
  function costruisciEvento(raw, campi) {
    // Codici di stato di Cineca UP (dal frontend ufficiale, costante statiImpegno):
    // B bozza, C confermato, P pubblicato, S sospeso, A annullato, E da eliminare, R da revocare.
    const stato = raw.stato || '';
    const sospesa = stato === 'S' || !!raw.notaSospensione || !!(raw.warning && raw.warning.sovrapposizioniSospensione === true);
    const annullato = stato === 'A' || stato === 'E' || stato === 'R' || sospesa || raw.attivo === false;
    return {
      id: campi.id,
      codice: campi.codice,
      nome: campi.nome,
      anno: campi.anno,
      tipo: campi.tipo,
      docenti: uniq((raw.docenti || []).map((d) => titleCase(d.nome + ' ' + d.cognome))),
      aule: uniq((raw.aule || []).map((a) => a.descrizione)),
      luoghi: campi.luoghi,
      partizioni: campi.partizioni,
      inizio: raw.dataInizio,
      fine: raw.dataFine,
      annullato,
      sospesa: annullato && sospesa,
      // lezione messa per recuperarne una annullata
      recupero: !!raw.recuperoPerImpegniId,
      online: raw.linkTeledidattica || (raw.evento && raw.evento.linkOnline) || '',
      modificato: raw.dataModifica || '',
      indirizzi: campi.indirizzi
    };
  }

  function normalizeEvent(raw) {
    const partizioni = uniq(
      (raw.evento && raw.evento.dettagliDidattici || []).map((d) => cleanPartizione(d.partizione && d.partizione.descrizione))
    );
    // dove si svolge: edificio e piano servono per la mappa e per i tempi a piedi
    const luoghi = (raw.aule || []).map((a) => ({
      aula: a.descrizione || '',
      edificio: a.edificio && a.edificio.codice || '',
      edificioNome: a.edificio && a.edificio.descrizione || '',
      piano: a.piano && a.piano.codice || '',
      pianoNome: a.piano && a.piano.descrizione || ''
    })).filter((l) => l.aula);
    return costruisciEvento(raw, {
      id: raw.id || (raw.eventoId + '@' + raw.dataInizio),
      codice: raw.codiceAttivita || '',
      nome: prettyName(raw.nome) || 'Insegnamento',
      anno: raw.annoCorso == null ? null : Number(raw.annoCorso),
      tipo: raw.tipoAttivita && raw.tipoAttivita.codice || '',
      partizioni,
      luoghi,
      // la vecchia API normalizza senza sapere per quale corso si è scelto il calendario: i dettagli
      // degli altri corsi porterebbero i loro curricula. Qui restano vuoti, li dà la nuova API.
      indirizzi: []
    });
  }

  // Evento della nuova API pubblica Cineca (docs/cineca-nuova.md): nome/codice/anno/tipo non stanno
  // al primo livello ma nei dettagli didattici. `corsoIds` = i corsi del calendario scelto (i dettagli
  // degli altri non ci riguardano); `piani` = aule con il piano (aule.json), perché qui l'aula non lo
  // porta. Stessi campi e stesse regole di normalizeEvent, più `indirizzi`.
  function normalizePublicEvent(raw, corsoIds, piani) {
    const tutti = (raw.evento && raw.evento.dettagliDidattici) || [];
    const idCorsi = corsoIds || [];
    let dettagli = tutti.filter((d) => idCorsi.includes(d.corsoId));
    if (!dettagli.length) dettagli = tutti; // corso non riconosciuto: meglio mostrarli tutti
    const d0 = dettagli[0] || {};
    const luoghi = (raw.aule || []).map((a) => {
      const p = piani?.[a.id]?.piano || {};
      return {
        aula: a.descrizione || '',
        edificio: a.edificio && a.edificio.codice || '',
        edificioNome: a.edificio && a.edificio.descrizione || '',
        piano: p.codice || '',
        pianoNome: p.descrizione || ''
      };
    }).filter((l) => l.aula);
    return costruisciEvento(raw, {
      id: raw.id || (raw.eventoId + '@' + raw.dataInizio),
      codice: d0.codice || '',
      nome: prettyName(d0.nome) || 'Insegnamento',
      anno: d0.annoCorso == null ? null : Number(d0.annoCorso),
      tipo: raw.evento && raw.evento.tipoAttivita && raw.evento.tipoAttivita.codice || '',
      partizioni: uniq(dettagli.map((d) => cleanPartizione(d.partizione && d.partizione.descrizione))),
      luoghi,
      indirizzi: indirizziDa(dettagli)
    });
  }

  // Le stesse regole per entrambe le API: scarta i record incompleti e le indisponibilità, toglie i
  // doppioni per id, ordina per inizio e nome. Cambia solo come si costruisce il singolo evento.
  function normalizzaLista(data, faiEvento) {
    const arr = Array.isArray(data) ? data : data ? [data] : [];
    const seen = new Set();
    const out = [];
    for (const raw of arr) {
      if (!raw || !raw.dataInizio || !raw.dataFine) continue; // record incompleti
      // festività e chiusure ("Tutti i Santi"): arrivano come eventi di 24 ore senza nome né corso
      if (raw.indisponibilita === true) continue;
      const ev = faiEvento(raw);
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      out.push(ev);
    }
    return out.sort((a, b) => a.inizio.localeCompare(b.inizio) || a.nome.localeCompare(b.nome));
  }

  function normalizeResponse(data) {
    return normalizzaLista(data, (raw) => normalizeEvent(raw));
  }

  // Nuova API pubblica: come normalizeResponse ma con i corsi del calendario e le aule col piano.
  function normalizePublicResponse(data, corsoIds, piani) {
    return normalizzaLista(data, (raw) => normalizePublicEvent(raw, corsoIds, piani));
  }

  // Più calendari insieme (es. Poliba: corso + insegnamenti comuni del 1° anno): una lezione che
  // compare in entrambi si tiene una volta sola.
  function mergeEvents(lists) {
    const seen = new Map();
    for (const l of lists) for (const e of l) if (!seen.has(e.id)) seen.set(e.id, e);
    return Array.from(seen.values()).sort((a, b) => a.inizio.localeCompare(b.inizio) || a.nome.localeCompare(b.nome));
  }

  /* ---------- filtri ---------- */

  // "A-K" contiene "M"? Una partizione che non sembra un intervallo (es. "Turno 1") non
  // può escludere nessuno, quindi vale come "passa".
  function rangeContains(range, letter) {
    const m = /^([A-Z])\s*-\s*([A-Z])$/i.exec(range);
    if (!m) return true;
    const l = letter.toUpperCase();
    return l >= m[1].toUpperCase() && l <= m[2].toUpperCase();
  }

  // Un evento senza partizione è comune a tutti i cognomi: passa sempre.
  // (Il doc originale lo nascondeva quando era attivo un filtro cognome.)
  function partitionMatches(partizioni, letter) {
    if (!letter) return true;
    if (!partizioni || partizioni.length === 0) return true;
    return partizioni.some((p) => rangeContains(p, letter));
  }

  function passes(ev, f) {
    f = f || {};
    if (f.anni && f.anni.length && ev.anno != null && !f.anni.includes(ev.anno)) return false;
    if (!partitionMatches(ev.partizioni, f.lettera)) return false;
    // una lezione senza indirizzi (comune, o della vecchia API) è di tutti
    if (f.indirizzo && ev.indirizzi && ev.indirizzi.length && !ev.indirizzi.includes(f.indirizzo)) return false;
    if (f.miei && f.miei.length && !f.miei.includes(ev.codice)) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const hay = [ev.nome, ev.codice, ev.docenti.join(' '), ev.aule.join(' ')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function applyFilters(events, f) {
    return events.filter((ev) => passes(ev, f));
  }

  // Elenco insegnamenti distinti (per la scelta "i miei corsi"), filtrato per anno/cognome.
  function listSubjects(events, f) {
    const map = new Map();
    for (const ev of applyFilters(events, { ...f, miei: null, search: '' })) {
      if (!ev.codice) continue;
      if (!map.has(ev.codice)) map.set(ev.codice, { codice: ev.codice, nome: ev.nome.replace(/ \+ laboratorio$/i, ''), anno: ev.anno });
    }
    return Array.from(map.values()).sort((a, b) => (a.anno || 9) - (b.anno || 9) || a.nome.localeCompare(b.nome));
  }

  // Indirizzi distinti delle lezioni che passano gli altri filtri (per la scelta "Indirizzo").
  function listIndirizzi(events, f) {
    const set = new Set();
    for (const ev of applyFilters(events, { ...f, indirizzo: '', miei: null, search: '' })) for (const i of ev.indirizzi || []) set.add(i);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'it'));
  }

  /* ---------- raggruppamento e stato ---------- */

  function groupByDay(events) {
    const map = new Map();
    for (const ev of events) {
      const k = dayKey(ev.inizio);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ev);
    }
    return Array.from(map.keys()).sort().map((k) => ({ key: k, date: parseDayKey(k), events: map.get(k) }));
  }

  // 'passata' | 'incorso' | 'prossima'
  function nowState(ev, now) {
    const t = (now instanceof Date ? now : new Date(now)).getTime();
    if (t < new Date(ev.inizio).getTime()) return 'prossima';
    if (t < new Date(ev.fine).getTime()) return 'incorso';
    return 'passata';
  }

  function minutesUntil(ev, now) {
    return Math.round((new Date(ev.inizio).getTime() - now.getTime()) / 60000);
  }

  /* ---------- luoghi e tempi a piedi ---------- */

  // Minuti a piedi tra due luoghi (id stazione o codice edificio) dalla tabella di places.js.
  // null se la coppia non è nota; 0 se è lo stesso posto.
  function walkMinutes(places, a, b) {
    if (!a || !b) return null;
    if (a === b) return 0;
    const t = places && places.piedi && (places.piedi[a + '|' + b] || places.piedi[b + '|' + a]);
    return t ? t.min : null;
  }

  const edificioDi = (ev) => (ev.luoghi && ev.luoghi[0] && ev.luoghi[0].edificio) || '';

  // Giornata come sequenza: lezioni e, tra una lezione e la successiva, la pausa (se c'è) e il
  // cambio di edificio. Le lezioni annullate compaiono ma non contano per le pause.
  function dayPlan(events, places) {
    const sorted = events.slice().sort((a, b) => a.inizio.localeCompare(b.inizio));
    const out = [];
    let lastEnd = null, lastBuilding = '';
    for (const ev of sorted) {
      if (!ev.annullato && lastEnd) {
        const min = Math.round((new Date(ev.inizio) - new Date(lastEnd)) / 60000);
        const b = edificioDi(ev);
        const cambio = !!(b && lastBuilding && b !== lastBuilding);
        if (min > 0 || cambio) {
          out.push({ tipo: 'pausa', inizio: lastEnd, fine: ev.inizio, minuti: Math.max(0, min), cambioEdificio: cambio, piedi: cambio ? walkMinutes(places, lastBuilding, b) : 0 });
        }
      }
      out.push({ tipo: 'lezione', ev });
      if (!ev.annullato) {
        if (!lastEnd || ev.fine > lastEnd) lastEnd = ev.fine;
        lastBuilding = edificioDi(ev) || lastBuilding;
      }
    }
    return out;
  }

  // Prima e ultima lezione valide della giornata, per l'andata e il ritorno dalla stazione.
  function commute(events, places, stazione, margine) {
    const ok = events.filter((e) => !e.annullato).sort((a, b) => a.inizio.localeCompare(b.inizio));
    if (!ok.length) return null;
    const first = ok[0];
    const last = ok.reduce((m, e) => (e.fine > m.fine ? e : m), ok[0]);
    const andata = walkMinutes(places, stazione, edificioDi(first));
    const ritorno = walkMinutes(places, edificioDi(last), stazione);
    return {
      prima: first,
      ultima: last,
      piediAndata: andata,
      piediRitorno: ritorno,
      // entro quando lasciare la stazione per essere in aula `margine` minuti prima dell'inizio
      uscitaStazione: andata == null ? null : new Date(new Date(first.inizio).getTime() - (andata + (margine || 0)) * 60000),
      arrivoStazione: ritorno == null ? null : new Date(new Date(last.fine).getTime() + ritorno * 60000)
    };
  }

  /* ---------- corsi ---------- */

  const N_COLORI = 8;

  // Un colore scelto dall'utente: indice della palette (vecchio formato, fino alla 1.3.0) oppure
  // "#rrggbb" (dalla mazzetta; fino al 03/10 dal selettore di sistema, quindi qualunque). Tutto il resto è scartato: il valore finisce in style="--cc: …".
  const coloreValido = (c) => (Number.isInteger(c) && c >= 0 && c < N_COLORI) || (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c));

  // Colore stabile per corso (lo stesso codice dà sempre lo stesso colore), salvo scelta dell'utente.
  // Restituisce un indice della palette (segue il tema) o un "#rrggbb" scelto a mano.
  function courseColor(codice, scelte) {
    const s = scelte && scelte[codice];
    if (coloreValido(s)) return typeof s === 'string' ? s.toLowerCase() : s;
    let h = 0;
    for (const ch of String(codice)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h % N_COLORI;
  }

  // Mazzetta: i colori che si possono scegliere per un corso. Il colore scelto è uguale nei due temi,
  // quindi deve reggere sia sul bianco sia sul nero: luminanza relativa tra ~0,11 e ~0,30 dà ≥ 3:1 su
  // entrambi (WCAG 1.4.11, la striscia è un'informazione grafica). Toni a luminanza 0,27 / 0,18 / 0,115,
  // saturazione HSL 0,85 (calcolo in docs/mockup/colore.html). Niente rosso puro: è "adesso".
  // Ordine = griglia: 12 tinte in due blocchi da 6 (caldi, freddi), righe chiaro → scuro.
  const TONI = ['chiaro', 'medio', 'scuro'];
  const TINTE = [
    ['Mattone', 20, ['#ed621d', '#c94e10', '#a4400d']],
    ['Arancio', 35, ['#c97c10', '#a8670e', '#87530b']],
    ['Ocra', 48, ['#aa8b0e', '#8d730b', '#735e09']],
    ['Oliva', 72, ['#7c990c', '#677f0a', '#546608']],
    ['Verde', 105, ['#33a30d', '#2a870b', '#226d09']],
    ['Smeraldo', 148, ['#0da353', '#0b8745', '#096e38']],
    ['Petrolio', 178, ['#0d9f9a', '#0b847f', '#096b67']],
    ['Azzurro', 198, ['#1198d1', '#0e7dad', '#0b668d']],
    ['Blu', 218, ['#528cf1', '#2770ed', '#1157d0']],
    ['Indaco', 245, ['#887ff5', '#6c60f2', '#4e3fef']],
    ['Viola', 275, ['#ba69f3', '#a63fef', '#8c12e3']],
    ['Magenta', 318, ['#f049be', '#dc129f', '#b30e81']]
  ];

  const linRgb = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const rgbDi = (hex) => { const n = Number.parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  // luminanza relativa WCAG di "#rrggbb"
  function luminanza(hex) {
    const [r, g, b] = rgbDi(hex).map((v) => linRgb(v / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const contrasto = (a, b) => { const x = luminanza(a), y = luminanza(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  // Le 36 tessere nell'ordine della griglia: blocco caldi (3 righe × 6), poi blocco freddi.
  // spunta: 'b' bianca o 'n' nera, quella con più contrasto sulla tessera (soglia 0,18 → ≥ 4,5:1).
  function mazzetta() {
    const out = [];
    for (const da of [0, 6]) {
      for (let t = 0; t < 3; t++) {
        for (const [nome, , hex] of TINTE.slice(da, da + 6)) {
          out.push({ hex: hex[t], nome: nome + ' ' + TONI[t], spunta: luminanza(hex[t]) < 0.18 ? 'b' : 'n' });
        }
      }
    }
    return out;
  }

  // nomi della palette automatica (--c0…7), per dire a parole il colore (WCAG 1.4.1)
  const NOMI_PALETTE = ['Blu', 'Verde', 'Ambra', 'Viola', 'Ciano', 'Rosa', 'Lime', 'Ardesia'];

  // Nome a parole di un colore del corso: palette, tessera della mazzetta o "#rrggbb" qualsiasi
  // (scelto col selettore di sistema fino al 03/10: la tinta più vicina, senza tono).
  function nomeColore(c) {
    if (!coloreValido(c)) return '';
    if (typeof c === 'number') return NOMI_PALETTE[c];
    const hex = c.toLowerCase();
    for (const [nome, , toni] of TINTE) { const t = toni.indexOf(hex); if (t >= 0) return nome + ' ' + TONI[t]; }
    const [r, g, b] = rgbDi(hex).map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 0.12) return 'Grigio';
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    if (h < 10 || h >= 345) return 'Rosso';
    return TINTE.reduce((best, x) => (Math.abs(x[1] - h) < Math.abs(best[1] - h) ? x : best))[0];
  }

  // Tag di una lezione: si dice solo l'eccezione. Il gruppo di cognomi (A-K, L-Z) sparisce se c'è
  // il filtro per iniziale (le lezioni che passano sono già del tuo gruppo); le partizioni che non
  // sono intervalli di lettere ("Turno 2") restano sempre, il filtro non le tocca.
  const intervalloLettere = (p) => /^[A-Z]\s*-\s*[A-Z]$/i.test(String(p));
  function partizioniDaMostrare(partizioni, lettera) {
    return (partizioni || []).filter((p) => !lettera || !intervalloLettere(p));
  }
  // "Lezione" è il caso normale: si mostrano solo gli altri tipi (esercitazione, laboratorio…)
  const tipoDaMostrare = (tipo) => !!tipo && tipo !== 'LEZ';
  // Nome del tipo per il tag: lungo ("Laboratorio") nelle card, sigla ("LAB") negli orari del corso.
  // Un codice che Cineca aggiunge e che TIPI non conosce si mostra così com'è, uguale ovunque.
  const etichettaTipo = (tipo, breve) => (TIPI[tipo] ? (breve ? TIPI[tipo].sigla : TIPI[tipo].label) : String(tipo || ''));

  // Valore CSS per --cc: la variabile della palette (cambia col tema) o il colore scelto. null se non valido.
  function coloreCss(c) {
    if (!coloreValido(c)) return null;
    return typeof c === 'string' ? c.toLowerCase() : 'var(--c' + c + ')';
  }

  const nomeCorso = (nome) => String(nome || '').replace(/ \+ laboratorio$/i, '');

  // Tutto quello che si sa di un corso dalle settimane in cache: orari ricorrenti, docenti, aule.
  function courseInfo(events, codice, now) {
    const evs = events.filter((e) => e.codice === codice).sort((a, b) => a.inizio.localeCompare(b.inizio));
    if (!evs.length) return null;
    const slots = new Map();
    for (const e of evs) {
      if (e.annullato) continue;
      const d = new Date(e.inizio);
      const k = d.getDay() + '|' + fmtTime(e.inizio) + '|' + fmtTime(e.fine) + '|' + e.tipo;
      if (!slots.has(k)) slots.set(k, { giorno: d.getDay(), inizio: fmtTime(e.inizio), fine: fmtTime(e.fine), tipo: e.tipo, aule: new Set(), volte: 0 });
      const s = slots.get(k);
      s.volte++;
      e.aule.forEach((a) => s.aule.add(a));
    }
    const t = (now || new Date()).getTime();
    return {
      codice,
      nome: nomeCorso(evs[0].nome),
      anno: evs[0].anno,
      docenti: uniq(evs.flatMap((e) => e.docenti)),
      aule: uniq(evs.flatMap((e) => e.aule)),
      tipi: uniq(evs.map((e) => e.tipo)),
      // lunedì prima, poi per ora
      orari: Array.from(slots.values())
        .map((s) => Object.assign(s, { aule: Array.from(s.aule) }))
        .sort((a, b) => ((a.giorno + 6) % 7) - ((b.giorno + 6) % 7) || a.inizio.localeCompare(b.inizio)),
      prossima: evs.find((e) => !e.annullato && new Date(e.fine).getTime() > t) || null,
      lezioni: evs.length
    };
  }

  /* ---------- mappe dei piani ---------- */

  // "Aula 2 del Palazzo delle Aule" e "Aula 2" sono la stessa aula: si confronta senza il nome edificio.
  function roomKey(s) {
    return String(s || '').toLowerCase().replace(/\s+del(l')?\s*palazzo delle aule/, '').replace(/[^a-z0-9]/g, '');
  }

  // Dove disegnare un luogo sulle mappe: edificio, piano e (se la pianta lo etichetta) la stanza.
  function locateRoom(maps, luogo) {
    const ed = maps && luogo && maps[luogo.edificio];
    if (!ed) return null;
    const key = roomKey(luogo.aula);
    for (const p of ed.piani) {
      const i = p.spazi.findIndex((s) => s.nome && roomKey(s.nome) === key);
      if (i >= 0) return { edificio: luogo.edificio, piano: p.codice, spazio: i };
    }
    // aula non segnata sulla pianta ufficiale: si sa almeno il piano
    const p = ed.piani.find((x) => x.codice === luogo.piano);
    return p ? { edificio: luogo.edificio, piano: p.codice, spazio: -1 } : null;
  }

  /* ---------- confronto tra due scaricamenti ---------- */

  // Cosa è cambiato tra la copia salvata e quella appena scaricata.
  function diffSchedules(prev, next) {
    const before = new Map(prev.map((e) => [e.id, e]));
    const after = new Map(next.map((e) => [e.id, e]));
    const changes = [];
    for (const [id, ev] of after) {
      const old = before.get(id);
      if (!old) changes.push({ type: 'nuova', ev });
      else if (ev.annullato && !old.annullato) changes.push({ type: 'annullata', ev, prev: old });
      else if (old.inizio !== ev.inizio || old.fine !== ev.fine || old.aule.join() !== ev.aule.join()) {
        changes.push({ type: 'spostata', ev, prev: old });
      }
    }
    for (const [id, old] of before) if (!after.has(id)) changes.push({ type: 'rimossa', ev: old });
    return changes;
  }

  /* ---------- silenzioso a lezione ---------- */

  // Intervalli in cui tenere il telefono in Non disturbare: le lezioni valide, allargate di
  // `prima`/`dopo` minuti e unite quando tra una e l'altra passano al massimo `unisci` minuti (una
  // pausa di 10 minuti non deve far squillare il telefono né spegnere e riaccendere il DND).
  // Le lezioni solo online (senza aula) non contano: si seguono da dove si vuole.
  // Solo il futuro (fine dopo `now`), al massimo `max` intervalli. Tempi in ms epoch.
  function dndWindows(events, now, opts) {
    const o = Object.assign({ prima: 0, dopo: 0, unisci: 15, max: 60 }, opts);
    const t = (now instanceof Date ? now : new Date(now)).getTime();
    const iv = events
      .filter((e) => !e.annullato && e.aule && e.aule.length)
      .map((e) => ({ start: new Date(e.inizio).getTime() - o.prima * 60000, end: new Date(e.fine).getTime() + o.dopo * 60000 }))
      .filter((w) => w.end > t && w.end > w.start)
      .sort((a, b) => a.start - b.start);
    const out = [];
    for (const w of iv) {
      const last = out[out.length - 1];
      if (last && w.start - last.end <= o.unisci * 60000) last.end = Math.max(last.end, w.end);
      else out.push({ start: w.start, end: w.end });
    }
    return out.slice(0, o.max);
  }

  /* ---------- pagina Opzioni (righe di riepilogo, pure) ---------- */

  // Il pulsante "Seleziona/Deseleziona tutti" compare quando la lista ha almeno tanti corsi.
  const SOGLIA_TUTTI = 6;

  // Ora leggibile senza zero iniziale sull'ora ("7:30", "8:00", "13:00"); i minuti restano a due cifre.
  const hm = (d) => d.getHours() + ':' + pad(d.getMinutes());
  const oraSenzaZero = (s) => String(s).replace(/^0(?=\d)/, '');
  // Accetta ms epoch, Date o ISO (dndWindows produce ms epoch): tutto ridotto a ms.
  const toMs = (x) => (x instanceof Date ? x.getTime() : (typeof x === 'number' ? x : new Date(x).getTime()));

  // Riga "Promemoria": avviso = minuti prima (0 = niente; 10/15/30/60), riepilogo = 'HH:MM' o ''.
  // Le due parti si uniscono con " · "; la prima lettera va maiuscola solo per la frase intera.
  function statoPromemoria(avviso, riepilogo) {
    const parts = [];
    if (avviso === 60) parts.push('1 ora prima');
    else if (avviso > 0) parts.push(avviso + ' min prima');
    if (riepilogo) parts.push('riepilogo alle ' + oraSenzaZero(riepilogo));
    if (!parts.length) return 'Spenti';
    const s = parts.join(' · ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Riga "Viaggio": treno acceso → stazione (+ margine in aula se > 0); spento altrimenti.
  function statoViaggio(treno, margine) {
    if (!treno) return 'Spento';
    return margine > 0 ? 'Bari Centrale · ' + margine + ' min in aula prima' : 'Bari Centrale';
  }

  // Prima finestra {start, end} non ancora finita rispetto a now (end oltre now), o null.
  // Stesso criterio di dndWindows (end > t): una finestra che finisce esattamente a now è passata.
  function prossimaFinestra(windows, now) {
    const t = toMs(now);
    for (const w of (windows || [])) if (toMs(w.end) > t) return w;
    return null;
  }

  // Testo breve per una finestra: "in corso fino alle 13:00" se now è dentro; altrimenti
  // "oggi …"/"domani …"/"mer 2 ott …" a seconda del giorno (locale) di inizio.
  function fmtFinestra(w, now) {
    const s = new Date(toMs(w.start)), e = new Date(toMs(w.end)), t = toMs(now);
    if (toMs(w.start) <= t && t < toMs(w.end)) return 'in corso fino alle ' + hm(e);
    const range = hm(s) + '–' + hm(e);
    const nd = now instanceof Date ? now : new Date(now);
    const sk = dayKey(s);
    if (sk === dayKey(nd)) return 'oggi ' + range;
    if (sk === dayKey(addDays(nd, 1))) return 'domani ' + range;
    return GIORNI_ABBR[s.getDay()] + ' ' + dataBreve(s) + ' ' + range;
  }

  // Pulsante "Seleziona/Deseleziona tutti" della lista "I miei corsi". Non muta gli array in ingresso.
  // tutti = tutti i `codici` sono già in `miei` → deseleziona (toglie i codici); altrimenti
  // seleziona (unione miei+codici, senza doppioni, i nuovi in ordine di `codici`).
  function tuttiMiei(codici, miei) {
    const cod = codici || [], mine = miei || [];
    const have = new Set(mine);
    const tutti = cod.length > 0 && cod.every((c) => have.has(c));
    if (tutti) {
      const rem = new Set(cod);
      return { tutti: true, azione: 'Deseleziona tutti', dopo: mine.filter((c) => !rem.has(c)) };
    }
    const dopo = mine.slice();
    for (const c of cod) if (!have.has(c)) { have.add(c); dopo.push(c); }
    return { tutti: false, azione: 'Seleziona tutti', dopo };
  }

  // Riga di conteggio della lista "I miei corsi": n spuntati su tot (singolare/plurale).
  function statoMiei(n, tot) {
    if (!n) return 'Nessuno spuntato: li vedi tutti';
    return n + ' di ' + tot + ' ' + plurale(n, 'spuntato', 'spuntati');
  }

  /* ---------- .ics ---------- */

  const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const byteLen = (s) => (enc ? enc.encode(s).length : Buffer.byteLength(s, 'utf8'));

  function icsEscape(s) {
    return String(s).replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replace(/\r?\n/g, '\\n');
  }

  function icsDate(iso) {
    return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  // RFC 5545: righe max 75 ottetti, continuazione con CRLF + spazio.
  function foldLine(line) {
    if (byteLen(line) <= 75) return line;
    const out = [];
    let cur = '';
    let curBytes = 0;
    for (const ch of line) {
      const b = byteLen(ch);
      const limit = out.length === 0 ? 75 : 74; // la riga di continuazione perde 1 ottetto per lo spazio
      if (curBytes + b > limit) {
        out.push(cur);
        cur = '';
        curBytes = 0;
      }
      cur += ch;
      curBytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }

  function toICS(events, now) {
    const stamp = icsDate((now || new Date()).toISOString());
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sciamn//IT', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Orario UniBA'];
    for (const ev of events) {
      const tipo = TIPI[ev.tipo] ? TIPI[ev.tipo].label : '';
      const desc = [tipo, ev.docenti.join(', '), ev.codice && 'Cod. ' + ev.codice].filter(Boolean).join(' — ');
      lines.push(
        'BEGIN:VEVENT',
        'UID:' + ev.id + '@uniplanner',
        'DTSTAMP:' + stamp,
        'DTSTART:' + icsDate(ev.inizio),
        'DTEND:' + icsDate(ev.fine),
        'SUMMARY:' + icsEscape(ev.nome + (tipo && ev.tipo !== 'LEZ' ? ' (' + tipo + ')' : '')),
        'LOCATION:' + icsEscape(ev.aule.join(', ')),
        'DESCRIPTION:' + icsEscape(desc),
        'STATUS:' + (ev.annullato ? 'CANCELLED' : 'CONFIRMED'),
        'END:VEVENT'
      );
    }
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }

  /* ---------- aggiornamenti OTA ---------- */

  // Solo x.y.z numerici: la CI tagga così, qualsiasi altra forma rende il manifest non valido.
  function parseVersion(v) {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v == null ? '' : v).trim());
    return m ? [+m[1], +m[2], +m[3]] : null;
  }

  // -1 / 0 / 1; NaN se una delle due non è una versione.
  function compareVersions(a, b) {
    const x = parseVersion(a), y = parseVersion(b);
    if (!x || !y) return NaN;
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  }

  // Cosa fare col manifest dell'ultima release. current = { bundle, native }: versione del www
  // in uso e dell'APK installata. 'needApk' = il www nuovo chiede plugin nativi che questa APK
  // non ha: applicarlo romperebbe l'app, serve reinstallare.
  function decideUpdate(manifest, current) {
    const m = manifest || {};
    const valido = parseVersion(m.version) && parseVersion(m.nativeMin) &&
      typeof m.url === 'string' && m.url.indexOf(CONFIG.aggiornamenti.prefissoBundle) === 0 &&
      typeof m.checksum === 'string' && m.checksum && typeof m.sessionKey === 'string' && m.sessionKey;
    if (!valido) return 'invalid';
    if (!(compareVersions(m.version, current.bundle) > 0)) return 'none';
    if (!(compareVersions(current.native, m.nativeMin) >= 0)) return 'needApk';
    return 'download';
  }

  // Link all'APK del manifest, solo se è un .apk del nostro repo delle release: è un file che
  // l'utente installa, quindi niente URL arbitrari anche se la firma del manifest non lo copre.
  function apkDaManifest(m) {
    const u = m && m.apk;
    return typeof u === 'string' && u.indexOf(CONFIG.aggiornamenti.prefissoBundle) === 0 && /\.apk$/.test(u) ? u : null;
  }

  // Voci del changelog più nuove dell'ultima vista: tutte, non solo l'ultima, così chi salta
  // versioni (app non aperta per settimane) non si perde niente. Vista illeggibile → nessuna.
  function novitaNonViste(log, vista) {
    if (!parseVersion(vista)) return [];
    return (log || []).filter((e) => compareVersions(e.version, vista) > 0);
  }

  // Tasto indietro di Android: cosa chiudere, dal livello più interno. stato = { overlay, view }.
  // Le frecce tra i giorni non si annullano: sfogliano, non navigano (come nelle app Android).
  function backAction(stato) {
    if (stato.overlay) return 'overlay';
    if (stato.view === 'corso') return 'corsi';
    if (stato.view === 'week' || stato.view === 'corsi' || stato.view === 'scegli' || stato.view === 'mappe') return 'oggi';
    return 'background';
  }

  // www/changelog.md → [{ version, date, items }] nell'ordine del file (la più recente in cima).
  // Contano solo i titoli "## x.y.z — aaaa-mm-gg" (data facoltativa) e i punti "- testo" sotto di
  // essi. Un altro titolo "## …" (es. "## Prossima versione", le novità non ancora rilasciate)
  // chiude la sezione: i suoi punti non finiscono in nessuna versione. Il resto si ignora.
  // Lo usano l'app e la CI (note release).
  function parseChangelog(md) {
    const out = [];
    let cur = null;
    for (const raw of String(md || '').split(/\r?\n/)) {
      const l = raw.trim();
      const h = /^##\s+(\d+\.\d+\.\d+)(?:\s*[—–-]\s*(\d{4}-\d{2}-\d{2}))?\s*$/.exec(l);
      if (h) { cur = { version: h[1], date: h[2] || '', items: [] }; out.push(cur); continue; }
      if (/^##\s/.test(l)) { cur = null; continue; }
      const it = /^[-*]\s+(.+)$/.exec(l);
      if (it && cur) cur.items.push(it[1]);
    }
    return out;
  }

  /* ---------- feedback (docs/feedback.md) ---------- */

  // Gli stessi limiti del Worker (worker/src/feedback.js): un test li confronta. Qui servono per
  // dire subito all'utente cosa non va; il Worker rivalida comunque.
  const LIMITI_FEEDBACK = { testoMin: 10, testoMax: 1000, contatto: 100, versione: 20, corsi: 5, corso: 60, corpo: 4096 };

  function validaFeedback(form) {
    const L = LIMITI_FEEDBACK;
    if (!['problema', 'corso', 'idea'].includes(form.tipo)) return 'Scegli che tipo di segnalazione è.';
    const t = String(form.testo || '').trim();
    if (t.length < L.testoMin) return 'Scrivi almeno ' + L.testoMin + ' caratteri.';
    if (t.length > L.testoMax) return 'Massimo ' + L.testoMax + ' caratteri.';
    if (String(form.contatto || '').trim().length > L.contatto) return 'Il contatto è troppo lungo (massimo ' + L.contatto + ').';
    return null;
  }

  // Corpo da spedire. Versione e corsi partono solo se l'utente lascia acceso "Allega"; i valori
  // sono riportati nei limiti del Worker, così un dato strano non fa rifiutare tutto il messaggio.
  function feedbackPayload(form, ctx) {
    const L = LIMITI_FEEDBACK;
    const p = { tipo: form.tipo, testo: String(form.testo || '').trim(), contatto: String(form.contatto || '').trim() };
    if (!form.allega) return p;
    p.app = { versione: String(ctx.versione || '').slice(0, L.versione), nativa: String(ctx.nativa || '').slice(0, L.versione), piattaforma: ctx.piattaforma };
    p.corsi = (ctx.corsi || []).filter((c) => typeof c === 'string' && c.length <= L.corso).slice(0, L.corsi);
    return p;
  }

  // Risposta del Worker → testo per l'utente. status null = la richiesta non è proprio partita.
  function esitoFeedback(status) {
    if (status === 204) return { ok: true, msg: 'Inviato, grazie!' };
    if (status == null) return { ok: false, msg: 'Sei offline: il messaggio resta qui, riprova.' };
    if (status === 429) return { ok: false, msg: 'Troppi invii, riprova tra un minuto.' };
    if (status === 503) return { ok: false, msg: 'Le segnalazioni sono chiuse per ora, riprova più tardi.' };
    if (status === 400 || status === 413) return { ok: false, msg: 'Il messaggio non è stato accettato: controlla il testo.' };
    return { ok: false, msg: 'Non è andato, riprova.' };
  }

  /* ---------- conteggio anonimo (guida 2.5, docs/telemetria.md) ---------- */

  // Gli stessi elenchi del Worker (worker/src/attivi.js): un test li confronta.
  const FASCE_PING = ['pre', '0', '1-6', '7-29', '30+'];
  const FUNZIONI_PING = ['silenzioso', 'promemoria', 'riepilogo', 'calendario', 'viaggio', 'treni-visti', 'treni-dettaglio', 'treni-scelto'];
  const SEGNALI_TRENI = ['treni-visti', 'treni-dettaglio', 'treni-scelto'];

  // Data d'installazione salvata sul telefono. Chi aveva già l'app prima del ping non ne ha una: prende oggi col
  // segno `preesistente`, altrimenti il giorno dell'aggiornamento risulterebbero tutti installazioni nuove.
  function installazione(salvata, giaInstallata, oggi) {
    if (salvata && typeof salvata.giorno === 'string' && /^\d{4}-\d\d-\d\d$/.test(salvata.giorno)) return salvata;
    return { giorno: oggi, preesistente: !!giaInstallata };
  }

  // Fascia d'anzianità in giorni dall'installazione: il ping non porta date, e chi c'era già resta 'pre'.
  // Math.round: i giorni del cambio d'ora durano 23 o 25 ore. Un orologio tornato indietro dà '0'.
  function fasciaAnzianita(inst, oggi) {
    if (inst.preesistente) return 'pre';
    const giorni = Math.round((parseDayKey(oggi) - parseDayKey(inst.giorno)) / 86400000);
    if (giorni <= 0) return '0';
    if (giorni < 7) return '1-6';
    return giorni < 30 ? '7-29' : '30+';
  }

  // Funzioni accese, dalle impostazioni e dai segnali dei treni registrati dall'ultimo invio. Non `treno`: è acceso
  // di default per tutti e non direbbe niente; `viaggio` vuol dire stazione di casa scelta (piano T2a, P4).
  function funzioniAccese(settings, segnali) {
    const s = settings || {};
    const accese = {
      silenzioso: s.silenzioso === true,
      promemoria: Number(s.avviso) > 0,
      riepilogo: typeof s.riepilogo === 'string' && s.riepilogo !== '',
      calendario: s.calendario === true,
      viaggio: !!s.treno && Array.isArray(s.casa) && s.casa.length > 0
    };
    for (const x of SEGNALI_TRENI) accese[x] = Object.hasOwn(segnali || {}, x);
    return FUNZIONI_PING.filter((x) => accese[x]);
  }

  // Un segnale dei treni del giorno (li accende il collegamento dei treni, P5–P6): si tiene la data dell'ultima
  // volta, il ping lo porta al primo invio riuscito. Una chiamata sola al giorno, anche con un giorno di ritardo.
  function registraSegnale(segnali, nome, oggi) {
    if (!SEGNALI_TRENI.includes(nome)) return segnali || {};
    return { ...segnali, [nome]: oggi };
  }
  // Dopo un invio riuscito si tolgono i segnali spediti; uno registrato di nuovo in un altro giorno mentre la
  // richiesta era in volo resta per il prossimo.
  function segnaliDopoInvio(attuali, inviati) {
    const out = {};
    for (const [k, v] of Object.entries(attuali || {})) if (inviati[k] !== v) out[k] = v;
    return out;
  }

  // Il ping parte se il conteggio è acceso (`conteggio` assente = acceso, default della guida) e oggi non è già partito.
  const pingDovuto = ({ oggi, ultimo, settings }) => settings?.conteggio !== false && ultimo !== oggi;
  const corpoPing = ({ versione, inst, oggi, settings, segnali }) =>
    ({ v: String(versione || ''), a: fasciaAnzianita(inst, oggi), f: funzioniAccese(settings, segnali) });
  // 204 contato; 400/413 rifiutato, e riprovando non passerebbe: per oggi basta. Offline, 429 e 5xx si riprovano
  // alla prossima apertura.
  const pingChiuso = (status) => status === 204 || status === 400 || status === 413;
  // stesso Worker del feedback, rotta accanto (/v1/feedback → /v1/attivi); feedback spento = niente conteggio
  function urlPing(config) {
    const u = config.feedback?.url;
    return u ? new URL('attivi', u).href : '';
  }

  return {
    CONFIG, CATALOGO, TIPI,
    dayKey, parseDayKey, addDays, startOfWeek, fmtTime,
    chiaveCorso, calendario, calendariValidi, etichettaCalendario, parseLinkCalendario, cercaCorsi, MAX_RISULTATI, risultatiScelta, tipiCorsi, DIPARTIMENTI, dipartimentiCorsi, paginaCorso, anniPerCalendari, endpoint,
    buildRequestBody, intervalloSettimana, TETTO_PUBBLICA, urlPubblico, urlAula, dimezza, auleDaChiedere, eventiDelCalendario, daRicontrollare, conSospese, prettyName, titleCase, cleanPartizione, indirizziDa, normalizeEvent, normalizePublicEvent, normalizeResponse, normalizePublicResponse, mergeEvents, dndWindows,
    rangeContains, partitionMatches, passes, applyFilters, listSubjects, listIndirizzi,
    groupByDay, nowState, minutesUntil, diffSchedules, toICS, foldLine,
    walkMinutes, dayPlan, commute, N_COLORI, courseColor, coloreCss, courseInfo, roomKey, locateRoom,
    TINTE, luminanza, contrasto, mazzetta, nomeColore, partizioniDaMostrare, tipoDaMostrare, etichettaTipo,
    GIORNI_ABBR, MESI_ABBR, dataBreve, fmtSettimana, plurale,
    SOGLIA_TUTTI, statoPromemoria, statoViaggio, prossimaFinestra, fmtFinestra, tuttiMiei, statoMiei,
    LIMITI_FEEDBACK, validaFeedback, feedbackPayload, esitoFeedback,
    FASCE_PING, FUNZIONI_PING, SEGNALI_TRENI, installazione, fasciaAnzianita, funzioniAccese, registraSegnale, segnaliDopoInvio,
    pingDovuto, corpoPing, pingChiuso, urlPing,

    parseVersion, compareVersions, decideUpdate, apkDaManifest, parseChangelog, novitaNonViste, backAction
  };
});
