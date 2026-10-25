// L'agenda di una pagina corso (anni, settimane, giorni, righe di lezione, schede degli anni, pulsanti
// della settimana, fascia del canale) come funzioni pure che restituiscono HTML. Stanno qui, e non in
// pagina-corso.js, perché le usano due volte: il generatore (Node, ogni mattina) e la pagina stessa nel
// browser, che all'apertura richiede a Cineca le lezioni e rifà l'agenda con lo stesso identico codice
// (nessuna copia che possa divergere).
// Niente scorrimento infinito (25/10/2026): con JavaScript si vede un anno e una settimana alla volta; sul
// computer la settimana è una griglia di colonne, sul telefono un giorno alla volta scelto dalla striscia
// dei giorni. Senza JavaScript tutto resta nell'HTML, uno sotto l'altro: Google legge l'orario intero.
// UMD come www/js/core.js: `require` in Node, `OrariRighe` nel browser (caricato dopo settimane.js).
// Tutto ciò che viene da Cineca passa da esc(). Le classi le legge Tailwind (site/src/pagina.css).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./settimane.js'));
  else root.OrariRighe = factory(root.OrariSettimane);
})(typeof self !== 'undefined' ? self : this, // biome-ignore lint/complexity/noExcessiveLinesPerFunction: fabbrica UMD, contiene il modulo intero (stesso schema di www/js/core.js)
function (S) {
'use strict';

// Identico a esc() di scripts/release/pagina.js: quel file legge il disco e nel browser non c'è.
function esc(s) {
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// Pulsanti a scelta singola (anni, settimana, canale): un binario color carta, la scelta in inchiostro.
const SEGMENTO = 'flex min-h-11 items-center justify-center px-3.5 text-base font-bold whitespace-nowrap text-ink no-underline ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink';

function nomeAnno(anno) {
  return anno ? anno + '° anno' : 'Altre lezioni';
}

function luogo(ev) {
  const aule = (ev.aule || []).join(', ');
  return [aule, (ev.docenti || []).join(', ')].filter(Boolean).join(' · ');
}

// Le etichette sono eccezioni: annullata, sospesa e recupero solo quando capita.
function etichette(ev) {
  const out = [];
  if (ev.annullato) out.push('<span class="font-bold text-ink">' + (ev.sospesa ? 'Sospesa' : 'Annullata') + '</span>');
  if (ev.recupero) out.push('<span class="font-bold text-ink">Recupero</span>');
  return out.length ? '<p class="m-0 flex flex-wrap gap-x-3 text-[0.9375rem] text-ink-2">' + out.join('') + '</p>' : '';
}

// «Aula 1 A · Nardozza · A–K»: il canale in coda alla riga del luogo, così la lezione resta su due righe.
// Sta in .tag-canale col suo separatore: scelto un canale, il CSS lo nasconde tutto (sarebbe uguale per tutte).
function rigaLuogo(ev, conCanali) {
  const dove = luogo(ev);
  const canale = conCanali ? S.canaleDi(ev) : '';
  if (!dove && !canale) return '';
  const tag = canale ? '<span class="tag-canale whitespace-nowrap">' + (dove ? ' · ' : '') + '<span class="sr-only">canale </span>' + esc(canale.replace('-', '–')) + '</span>' : '';
  return '    <p class="m-0 text-[0.9375rem] text-ink-2">' + esc(dove) + tag + '</p>';
}

// Sul telefono l'ora sta a sinistra (inizio sopra, fine sotto); nella colonna stretta del computer sopra
// il nome, «8:30–11:00» su una riga. La lezione in corso la segna lo script (classe `adesso`).
function riga(ev, conCanali) {
  const canale = S.canaleDi(ev);
  const nome = ev.annullato ? '<s>' + esc(ev.nome) + '</s>' : esc(ev.nome);
  return [
    '<li class="lezione grid grid-cols-[4.25rem_minmax(0,1fr)] gap-3 border-t border-filetto py-3 lg:grid-cols-1 lg:gap-1"' + (canale ? ' data-canale="' + esc(canale) + '"' : '') + '>',
    '  <p class="ora m-0 leading-tight font-extrabold tabular-nums"><time datetime="' + esc(ev.inizio) + '">' + S.oraRoma(ev.inizio) + '</time>' +
      '<span class="block font-normal text-ink-2 lg:inline"><span class="max-lg:hidden">–</span><time datetime="' + esc(ev.fine) + '">' + S.oraRoma(ev.fine) + '</time></span></p>',
    '  <div class="grid content-start gap-0.5">',
    '    <p class="m-0 leading-snug font-bold">' + nome + '</p>',
    rigaLuogo(ev, conCanali),
    etichette(ev),
    '  </div>',
    '</li>'
  ].filter(Boolean).join('\n');
}

// Un giorno della griglia. Il giorno senza lezioni resta, con la sua frase: nella settimana a colonne un
// buco senza titolo sembrerebbe un errore. La stessa frase, nascosta, c'è anche nei giorni con lezioni:
// la mostra lo script quando il canale scelto li svuota.
function giorno(ymd, lezioni, conCanali) {
  const nessuna = '<p class="nessuna m-0 border-t border-filetto py-3 text-ink-2"' + (lezioni.length ? ' hidden' : '') + '>Nessuna lezione</p>';
  return [
    '<section class="giorno min-w-0" data-giorno="' + ymd + '">',
    '  <h4 class="m-0 pb-2 text-lg leading-tight font-extrabold">' + S.etichettaGiorno(ymd) + '</h4>',
    lezioni.length ? '  <ol class="m-0 list-none p-0">\n' + lezioni.map((ev) => riga(ev, conCanali)).join('\n') + '\n  </ol>' : '',
    '  ' + nessuna,
    '</section>'
  ].filter(Boolean).join('\n');
}

// I giorni di una settimana: da lunedì a venerdì sempre, il sabato (e oltre) solo se c'è lezione.
function giorniDi(s) {
  const venerdi = S.piuGiorni(s.lunedi, 4);
  const extra = s.giorni.map((g) => g.giorno).filter((g) => g > venerdi);
  return [0, 1, 2, 3, 4].map((i) => S.piuGiorni(s.lunedi, i)).concat(extra);
}

function lezioniDel(s, ymd) {
  const g = s.giorni.find((x) => x.giorno === ymd);
  return g ? g.lezioni : [];
}

function fineSettimana(s) {
  const giorni = giorniDi(s);
  return giorni[giorni.length - 1];
}

// Il titolo della settimana serve a chi legge senza JavaScript (tutte una sotto l'altra) e ai lettori di
// schermo; con JavaScript lo dicono già i pulsanti della settimana e la striscia dei giorni.
function settimana(s, conCanali, prima) {
  const giorni = giorniDi(s);
  return [
    '<section class="settimana' + (prima ? '' : ' mt-12 [.js_&]:mt-0') + '" data-lunedi="' + s.lunedi + '">',
    '  <h3 class="m-0 mb-4 text-xl font-bold [.js_&]:sr-only">Settimana ' + S.dalAl(s.lunedi, fineSettimana(s)) + '</h3>',
    '  <div class="grid gap-x-5 gap-y-8 ' + (giorni.length > 5 ? 'lg:grid-cols-6' : 'lg:grid-cols-5') + '">',
    giorni.map((ymd) => giorno(ymd, lezioniDel(s, ymd), conCanali)).join('\n'),
    '  </div>',
    '</section>'
  ].join('\n');
}

// La striscia dei giorni (solo telefono e solo con JavaScript): tutti i giorni delle settimane mostrate,
// una piccola pausa tra una settimana e l'altra. Scorre di lato dentro la sua riga, mai la pagina. Lo stile
// dei pulsanti sta in site/src/pagina.css (.scelta-giorno): sono trenta per pagina, le classi ripetute pesavano.
function pulsanteGiorno(ymd, vuoto) {
  return '<button type="button" data-scegli-giorno="' + ymd + '" aria-pressed="false"' + (vuoto ? ' data-vuoto="true"' : '') +
    ' class="scelta-giorno">' +
    '<span class="text-sm">' + S.giornoBreve(ymd) + '</span><span class="numero">' + S.numeroGiorno(ymd) + '</span>' +
    '<span class="sr-only"> ' + S.dataLunga(ymd) + '</span></button>';
}

function strisciaGiorni(g, anno) {
  const settimane = g.settimane.map((s) => '<div class="flex gap-1">' + giorniDi(s).map((ymd) => pulsanteGiorno(ymd, !lezioniDel(s, ymd).length)).join('') + '</div>');
  return '<nav aria-label="Giorni, ' + nomeAnno(anno) + '" class="giorni relative mb-5 hidden gap-3 overflow-x-auto [.js_&]:flex lg:[.js_&]:hidden">' + settimane.join('') + '</nav>';
}

function sezioneAnno(g, conCanali, soloUno) {
  const id = 'anno-' + (g.anno || 'altro');
  return [
    '<section id="' + id + '" class="anno scroll-mt-4" aria-labelledby="t-' + id + '">',
    '  <h2 id="t-' + id + '" class="' + (soloUno ? 'sr-only' : 'm-0 mt-12 mb-6 font-titolo text-[1.75rem] leading-none tracking-tight uppercase [.js_&]:sr-only') + '">' + nomeAnno(g.anno) + '</h2>',
    strisciaGiorni(g, g.anno),
    g.settimane.map((s, i) => settimana(s, conCanali, i === 0)).join('\n'),
    '</section>'
  ].join('\n');
}

// Le schede degli anni: senza JavaScript sono salti alle sezioni (tutte visibili); con JavaScript una
// sola sezione alla volta (script in comune.js). Con un anno solo non servono.
function schedeAnni(gruppi) {
  if (gruppi.length < 2) return '';
  const voci = gruppi.map((g, i) => '<a href="#anno-' + (g.anno || 'altro') + '"' + (i === 0 ? ' aria-current="true"' : '') +
    ' class="scheda-anno ' + SEGMENTO + ' flex-1 lg:flex-none aria-[current=true]:bg-ink aria-[current=true]:text-bg">' + nomeAnno(g.anno) + '</a>');
  return '<nav aria-label="Anni di corso" class="flex gap-0.5 bg-panel p-0.5">' + voci.join('') + '</nav>';
}

// La settimana sul computer (solo con JavaScript; sul telefono la sceglie la striscia dei giorni). Le
// date nei pulsanti e non «questa/prossima»: la pagina statica di sabato mostra già la settimana dopo.
function pulsantiSettimana(lunedi, settimane) {
  if (settimane < 2) return '';
  const voci = Array.from({ length: settimane }, (_, i) => S.piuGiorni(lunedi, 7 * i)).map((l, i) =>
    '<button type="button" data-scegli-settimana="' + l + '" aria-pressed="' + (i === 0) + '" class="' + SEGMENTO + ' aria-pressed:bg-ink aria-pressed:text-bg">' + S.dalAlBreve(l, S.piuGiorni(l, 4)) + '</button>');
  return '<div role="group" aria-label="Settimana" class="hidden gap-0.5 bg-panel p-0.5 lg:[.js_&]:flex">' + voci.join('') + '</div>';
}

// Il canale si sceglie solo con JavaScript (i pulsanti nascondono le righe degli altri): senza, la fascia
// resta nascosta e ogni riga dice il suo canale.
function fasciaCanale(canali) {
  if (canali.length < 2) return '';
  const pulsante = (valore, testo, premuto) => '<button type="button" data-scegli-canale="' + esc(valore) + '" aria-pressed="' + premuto + '"' +
    ' class="' + SEGMENTO + ' aria-pressed:bg-ink aria-pressed:text-bg">' + esc(testo) + '</button>';
  return [
    '<div id="canale" hidden class="flex items-center justify-between gap-3">',
    '  <span id="canale-nome" class="text-base">Canale<span class="sr-only">, per iniziale del cognome</span></span>',
    '  <div role="group" aria-labelledby="canale-nome" class="flex gap-0.5 bg-panel p-0.5">',
    '    ' + pulsante('', 'Tutti', true) + canali.map((c) => pulsante(c, c.replace('-', '–'), false)).join(''),
    '  </div>',
    '</div>'
  ].join('\n');
}

// Un anno senza nessuna lezione nelle settimane mostrate non merita una scheda.
function conLezioni(gruppo) {
  return gruppo.settimane.some((s) => s.giorni.length);
}

/** «dal 26 ottobre al 6 novembre 2026»: dal primo lunedì al venerdì dell'ultima settimana. */
function periodoDi(lunedi, settimane) {
  return S.dalAl(lunedi, S.piuGiorni(S.piuGiorni(lunedi, 7 * (settimane - 1)), 4));
}

/** Tutto ciò che cambia con le lezioni: le lezioni normalizzate (core.normalizePublicResponse) da `lunedi`
 *  per `settimane` settimane → { html, schede, settimane, fascia, periodo, canali, vuota }. `html` = le
 *  sezioni degli anni (o il testo «nessuna lezione»), `schede` = la barra degli anni, `settimane` = i
 *  pulsanti della settimana, `fascia` = la scelta del canale. */
function agenda(eventi, lunedi, settimane) {
  const gruppi = S.raggruppa(eventi, lunedi, settimane).filter(conLezioni);
  const canali = S.canali(eventi);
  const conCanali = canali.length > 1;
  const periodo = periodoDi(lunedi, settimane);
  const html = gruppi.length
    ? gruppi.map((g) => sezioneAnno(g, conCanali, gruppi.length === 1)).join('\n')
    : '<p class="mt-10 mb-0 text-lg">Nessuna lezione pubblicata ' + periodo + '. Di solito succede tra un semestre e l\'altro.</p>';
  return {
    html,
    schede: schedeAnni(gruppi),
    settimane: gruppi.length ? pulsantiSettimana(lunedi, settimane) : '',
    fascia: fasciaCanale(canali),
    periodo,
    canali,
    vuota: !gruppi.length
  };
}

/** Impronta breve (djb2) di ciò che la pagina mostra: la pagina statica ne porta una, il browser la
 *  confronta con quella delle lezioni appena scaricate. Si confronta questa e non l'HTML perché
 *  `innerHTML` rilegge il markup a modo suo (virgolette, attributi) e non sarebbe mai uguale. */
function impronta(r) {
  const testo = [r.html, r.schede, r.settimane, r.fascia, r.periodo].join('\u0001');
  let h = 5381;
  for (const c of testo) h = (Math.imul(h, 33) + c.codePointAt(0)) | 0;
  return (h >>> 0).toString(36);
}

return { esc, nomeAnno, luogo, etichette, rigaLuogo, riga, giorno, settimana, strisciaGiorni, sezioneAnno, schedeAnni, pulsantiSettimana, fasciaCanale, agenda, impronta };
});
