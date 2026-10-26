// Date, ore e raggruppamento delle lezioni per le pagine orario dei corsi. Logica pura, zero rete.
// Tutto in ora di Roma con Intl (fuori da www/js/trasporti/ è permesso): Cineca dà gli istanti in UTC e
// la pagina si genera su un runner in UTC, quindi il fuso della macchina non deve mai contare.
// UMD come www/js/core.js: in Node si carica con require, nel browser (pagina corso, aggiornamento dal
// vivo) è lo script classico che espone `OrariSettimane`, senza build.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OrariSettimane = factory();
})(typeof self !== 'undefined' ? self : this, // biome-ignore lint/complexity/noExcessiveLinesPerFunction: fabbrica UMD, contiene il modulo intero (stesso schema di www/js/core.js)
function () {
'use strict';

const FUSO = 'Europe/Rome';
const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const fmtGiorno = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtOra = new Intl.DateTimeFormat('it-IT', { timeZone: FUSO, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' });

/** Istante (ISO o Date) → 'AAAA-MM-GG' del giorno di Roma. */
function giornoRoma(istante) {
  return fmtGiorno.format(new Date(istante));
}

/** Istante → «8:30» in ora di Roma (ora senza zero davanti, come sugli orari affissi). */
function oraRoma(istante) {
  return fmtOra.format(new Date(istante));
}

// I giorni come 'AAAA-MM-GG' si contano a mezzogiorno UTC: nessun cambio d'ora li sposta di data.
function aGiorno(ymd) {
  return new Date(ymd + 'T12:00:00Z');
}

function piuGiorni(ymd, n) {
  const d = aGiorno(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Il lunedì della prima settimana da mostrare: quella in corso, ma di sabato e di domenica la prossima
 *  (la settimana che finisce non serve più a nessuno). */
function primoLunedi(adesso) {
  const oggi = giornoRoma(adesso);
  const dow = aGiorno(oggi).getUTCDay();
  if (dow === 0) return piuGiorni(oggi, 1);
  if (dow === 6) return piuGiorni(oggi, 2);
  return piuGiorni(oggi, 1 - dow);
}

/** Intervallo da chiedere a Cineca per `settimane` settimane dal lunedì dato. I limiti sono in UTC: a
 *  mezzanotte non c'è lezione, quindi un'ora di differenza col giorno di Roma non perde nulla. */
function intervallo(lunedi, settimane) {
  return { da: lunedi + 'T00:00:00.000Z', a: piuGiorni(lunedi, 7 * settimane - 1) + 'T23:59:59.999Z' };
}

/** 'AAAA-MM-GG' → «Lunedì 26». */
function etichettaGiorno(ymd) {
  const d = aGiorno(ymd);
  return GIORNI[d.getUTCDay()] + ' ' + d.getUTCDate();
}

/** 'AAAA-MM-GG' → «26 ottobre 2026». */
function dataLunga(ymd) {
  const d = aGiorno(ymd);
  return d.getUTCDate() + ' ' + MESI[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

/** Da lunedì a `ultimo` (venerdì o sabato) → «dal 26 al 30 ottobre 2026», «dal 28 settembre al 2 ottobre
 *  2026», «dal 29 dicembre 2025 al 2 gennaio 2026». */
function dalAl(lunedi, ultimo) {
  const a = aGiorno(lunedi);
  const b = aGiorno(ultimo);
  let primo = String(a.getUTCDate());
  if (a.getUTCMonth() !== b.getUTCMonth()) primo += ' ' + MESI[a.getUTCMonth()];
  if (a.getUTCFullYear() !== b.getUTCFullYear()) primo += ' ' + a.getUTCFullYear();
  return 'dal ' + primo + ' al ' + dataLunga(ultimo);
}

/** 'AAAA-MM-GG' → «2026/2027»: l'anno accademico comincia il 1° settembre. */
function annoAccademico(ymd) {
  const [a, m] = ymd.split('-').map(Number);
  const inizio = m >= 9 ? a : a - 1;
  return inizio + '/' + (inizio + 1);
}

/** 'AAAA-MM-GG' → «Lun»: la striscia dei giorni sul telefono. */
function giornoBreve(ymd) {
  return GIORNI[aGiorno(ymd).getUTCDay()].slice(0, 3);
}

/** 'AAAA-MM-GG' → 26. */
function numeroGiorno(ymd) {
  return aGiorno(ymd).getUTCDate();
}

/** Da lunedì a `ultimo` → «26–30 ottobre», «28 settembre – 2 ottobre»: il nome di una settimana nei
 *  pulsanti, dove l'anno lo dice già la testata. */
function dalAlBreve(lunedi, ultimo) {
  const a = aGiorno(lunedi);
  const b = aGiorno(ultimo);
  const fine = b.getUTCDate() + ' ' + MESI[b.getUTCMonth()];
  return a.getUTCMonth() === b.getUTCMonth() ? a.getUTCDate() + '–' + fine : a.getUTCDate() + ' ' + MESI[a.getUTCMonth()] + ' – ' + fine;
}

/** Un canale è un intervallo di iniziali del cognome ('A-K'); il resto non divide per lettera. */
function eCanale(p) {
  return /^[A-Z]-[A-Z]$/.test(String(p || '').toUpperCase());
}

function canaleDi(ev) {
  const c = (ev.partizioni || []).find(eCanale);
  return c ? c.toUpperCase() : '';
}

/** I canali del corso, ordinati; vuoto se il corso non si divide per lettera. */
function canali(eventi) {
  return Array.from(new Set(eventi.map(canaleDi).filter(Boolean))).sort();
}

/** Lezioni normalizzate (core.normalizePublicResponse) → per anno di corso, per settimana, per giorno:
 *  [{ anno, settimane: [{ lunedi, giorni: [{ giorno, lezioni }] }] }]. Anno null = 0 (lezioni senza
 *  anno, per esempio i corsi a scelta), in fondo. Le settimane senza lezioni restano, con giorni vuoti. */
function raggruppa(eventi, lunedi, settimane) {
  const lunedi2 = Array.from({ length: settimane }, (_, i) => piuGiorni(lunedi, 7 * i));
  const anni = Array.from(new Set(eventi.map((e) => e.anno || 0))).sort((x, y) => (x || 99) - (y || 99));
  return anni.map((anno) => ({
    anno,
    settimane: lunedi2.map((l) => ({ lunedi: l, giorni: giorniDellaSettimana(eventi.filter((e) => (e.anno || 0) === anno), l) }))
  }));
}

function giorniDellaSettimana(eventi, lunedi) {
  const fine = piuGiorni(lunedi, 6);
  const perGiorno = new Map();
  for (const e of eventi) {
    const g = giornoRoma(e.inizio);
    if (g < lunedi || g > fine) continue;
    if (!perGiorno.has(g)) perGiorno.set(g, []);
    perGiorno.get(g).push(e);
  }
  return Array.from(perGiorno.keys()).sort().map((giorno) => ({
    giorno,
    lezioni: perGiorno.get(giorno).sort((x, y) => x.inizio.localeCompare(y.inizio) || x.nome.localeCompare(y.nome))
  }));
}

return { giornoRoma, oraRoma, piuGiorni, primoLunedi, intervallo, etichettaGiorno, giornoBreve, numeroGiorno, dataLunga, annoAccademico, dalAl, dalAlBreve, canaleDi, canali, raggruppa };
});
