// L'agenda di una pagina corso (giorni, righe di lezione, schede degli anni, fascia del canale) come
// funzioni pure che restituiscono HTML. Stanno qui, e non in pagina-corso.js, perché le usano due volte:
// il generatore (Node, ogni mattina) e la pagina stessa nel browser, che all'apertura richiede a Cineca le
// lezioni e rifà l'agenda con lo stesso identico codice (nessuna copia che possa divergere).
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
  const tag = canale ? '<span class="tag-canale">' + (dove ? ' · ' : '') + '<span class="sr-only">canale </span>' + esc(canale.replace('-', '–')) + '</span>' : '';
  return '    <p class="m-0 text-[0.9375rem] text-ink-2">' + esc(dove) + tag + '</p>';
}

function riga(ev, conCanali) {
  const canale = S.canaleDi(ev);
  const nome = ev.annullato ? '<s>' + esc(ev.nome) + '</s>' : esc(ev.nome);
  return [
    '<li class="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-3 border-t border-filetto py-3"' + (canale ? ' data-canale="' + esc(canale) + '"' : '') + '>',
    '  <p class="m-0 leading-tight font-extrabold tabular-nums"><time datetime="' + esc(ev.inizio) + '">' + S.oraRoma(ev.inizio) + '</time>' +
      '<span class="block font-normal text-ink-2"><time datetime="' + esc(ev.fine) + '">' + S.oraRoma(ev.fine) + '</time></span></p>',
    '  <div class="grid content-start gap-0.5">',
    '    <p class="m-0 leading-snug font-bold">' + nome + '</p>',
    rigaLuogo(ev, conCanali),
    etichette(ev),
    '  </div>',
    '</li>'
  ].filter(Boolean).join('\n');
}

function giorno(g, conCanali) {
  return [
    '<section class="giorno mt-8">',
    '  <h4 class="m-0 font-titolo text-[1.75rem] leading-none tracking-tight uppercase">' + S.etichettaGiorno(g.giorno) + '</h4>',
    '  <ol class="m-0 mt-3 list-none p-0">',
    g.lezioni.map((ev) => riga(ev, conCanali)).join('\n'),
    '  </ol>',
    '</section>'
  ].join('\n');
}

// La prima settimana la dice già il sottotitolo della testata: il suo titolo resta solo per chi usa un
// lettore di schermo. Dalla seconda in poi una fascia la separa da quella prima.
function settimana(s, conCanali, prima) {
  const ultimo = s.giorni.length ? s.giorni[s.giorni.length - 1].giorno : S.piuGiorni(s.lunedi, 4);
  const fine = ultimo > S.piuGiorni(s.lunedi, 4) ? ultimo : S.piuGiorni(s.lunedi, 4); // il sabato solo se c'è lezione
  const corpo = s.giorni.length ? s.giorni.map((g) => giorno(g, conCanali)).join('\n') : '<p class="mt-4 mb-0 text-ink-2">Nessuna lezione in questa settimana.</p>';
  return [
    '<section class="settimana' + (prima ? '' : ' mt-12') + '">',
    '  <h3 class="' + (prima ? 'sr-only' : 'm-0 bg-panel px-4 py-2 text-base font-bold') + '">Settimana ' + S.dalAl(s.lunedi, fine) + '</h3>',
    corpo,
    '</section>'
  ].join('\n');
}

function sezioneAnno(g, conCanali, soloUno) {
  const id = 'anno-' + (g.anno || 'altro');
  return [
    '<section id="' + id + '" class="anno scroll-mt-4" aria-labelledby="t-' + id + '">',
    '  <h2 id="t-' + id + '" class="' + (soloUno ? 'sr-only' : 'm-0 mt-12 font-titolo text-4xl leading-none tracking-tight uppercase [.js_&]:sr-only') + '">' + nomeAnno(g.anno) + '</h2>',
    g.settimane.map((s, i) => settimana(s, conCanali, i === 0)).join('\n'),
    '</section>'
  ].join('\n');
}

// Le schede degli anni: senza JavaScript sono salti alle sezioni (tutte visibili); con JavaScript una
// sola sezione alla volta (script in comune.js). Con un anno solo non servono.
function schedeAnni(gruppi) {
  if (gruppi.length < 2) return '';
  const voci = gruppi.map((g, i) => '<a href="#anno-' + (g.anno || 'altro') + '"' + (i === 0 ? ' aria-current="true"' : '') +
    ' class="scheda-anno flex min-h-11 flex-1 items-center justify-center bg-on-campo/15 px-3 text-base font-extrabold whitespace-nowrap text-on-campo no-underline aria-[current=true]:bg-on-campo aria-[current=true]:text-campo focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-on-campo">' + nomeAnno(g.anno) + '</a>');
  return '<nav aria-label="Anni di corso" class="mt-6 flex flex-wrap gap-1.5">' + voci.join('') + '</nav>';
}

// Il canale si sceglie solo con JavaScript (i pulsanti nascondono le righe degli altri): senza, la fascia
// resta nascosta e ogni riga dice il suo canale.
function fasciaCanale(canali) {
  if (canali.length < 2) return '';
  const pulsante = (valore, testo, premuto) => '<button type="button" data-scegli-canale="' + esc(valore) + '" aria-pressed="' + premuto + '"' +
    ' class="min-h-11 bg-bg px-3.5 font-semibold text-ink aria-pressed:bg-ink aria-pressed:text-bg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink">' + esc(testo) + '</button>';
  return [
    '<div id="canale" hidden class="bg-panel">',
    '  <div class="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 lg:px-8">',
    '    <span id="canale-nome" class="text-base">Canale<span class="sr-only">, per iniziale del cognome</span></span>',
    '    <div role="group" aria-labelledby="canale-nome" class="flex flex-wrap gap-0.5">',
    '      ' + pulsante('', 'Tutti', true) + canali.map((c) => pulsante(c, c.replace('-', '–'), false)).join(''),
    '    </div>',
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
 *  per `settimane` settimane → { html, schede, fascia, periodo, canali, vuota }. `html` = le sezioni degli
 *  anni (o il testo «nessuna lezione»), `schede` = la barra degli anni, `fascia` = la scelta del canale. */
function agenda(eventi, lunedi, settimane) {
  const gruppi = S.raggruppa(eventi, lunedi, settimane).filter(conLezioni);
  const canali = S.canali(eventi);
  const conCanali = canali.length > 1;
  const periodo = periodoDi(lunedi, settimane);
  const html = gruppi.length
    ? gruppi.map((g) => sezioneAnno(g, conCanali, gruppi.length === 1)).join('\n')
    : '<p class="mt-10 mb-0 text-lg">Nessuna lezione pubblicata ' + periodo + '. Di solito succede tra un semestre e l\'altro.</p>';
  return { html, schede: schedeAnni(gruppi), fascia: fasciaCanale(canali), periodo, canali, vuota: !gruppi.length };
}

/** Impronta breve (djb2) di ciò che la pagina mostra: la pagina statica ne porta una, il browser la
 *  confronta con quella delle lezioni appena scaricate. Si confronta questa e non l'HTML perché
 *  `innerHTML` rilegge il markup a modo suo (virgolette, attributi) e non sarebbe mai uguale. */
function impronta(r) {
  const testo = [r.html, r.schede, r.fascia, r.periodo].join('\u0001');
  let h = 5381;
  for (const c of testo) h = (Math.imul(h, 33) + c.codePointAt(0)) | 0;
  return (h >>> 0).toString(36);
}

return { esc, nomeAnno, luogo, etichette, rigaLuogo, riga, giorno, settimana, sezioneAnno, schedeAnni, fasciaCanale, agenda, impronta };
});
