/* Sciamn — atenei e aggiornamenti: un'unica build, il corso si sceglie nell'app.
   Gira in Node (require) e nel browser (script caricato prima di core.js). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UniPlannerConfig = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // L'elenco dei corsi non è qui ma in catalogo.js, generato da scripts/catalogo.js (docs/dati.md).
  // Qui solo gli atenei: tutti usano Cineca UP, cambiano host e clienteId (che il frontend UP
  // ricava da /api/Clienti/cercaPerDominio?dominio=<host>).
  return {
    atenei: {
      uniba: { nome: 'UniBA', nomeLungo: 'Università degli Studi di Bari Aldo Moro', host: 'uniba.prod.up.cineca.it', hostPubblico: 'uniba-public.prod.up.cineca.it', clienteId: '62d6582fec51ea2b84fbe79c' },
      // Ingegneria (informatica, gestionale…) a Bari è del Politecnico, non di UniBA
      poliba: { nome: 'Poliba', nomeLungo: 'Politecnico di Bari', host: 'poliba.prod.up.cineca.it', clienteId: '5a841031b15b88201b28c8d5' }
    },
    // Chiavi dei corsi delle versioni fino alla 1.2.x (registro scritto a mano) → chiave del catalogo.
    // Chi aveva scelto ITPS o Informatica resta lì senza accorgersi di niente.
    alias: {
      itps: 'uniba:7749',
      informatica: 'uniba:7746',
      // fino alla 1.3 Economia e management 2° anno aveva un calendario per indirizzo; dalla nuova API
      // è un corso solo, con il filtro "Indirizzo" già impostato (aliasIndirizzo)
      'uniba:8055::2:map': 'uniba:8055::2',
      'uniba:8055::2:marketing': 'uniba:8055::2',
      'uniba:8055::2:mso': 'uniba:8055::2'
    },
    // indirizzo da preselezionare per chi aveva uno di quei calendari (stessa grafia di core.indirizziDa)
    aliasIndirizzo: {
      'uniba:8055::2:map': 'Management delle amministrazioni pubbliche',
      'uniba:8055::2:marketing': 'Marketing',
      'uniba:8055::2:mso': 'Mercati, strategie e organizzazione'
    },
    // Installazioni di prima della scelta del corso in app usavano la build ITPS.
    corsoStorico: 'uniba:7749',
    // Aggiornamenti OTA del www (docs/release.md). Il repo è pubblico e contiene solo bundle
    // firmati: l'URL fisso qui sotto è una difesa in più, la garanzia vera è la firma.
    aggiornamenti: {
      manifest: 'https://github.com/LordMarte-A669/sciamn/releases/latest/download/manifest.json',
      prefissoBundle: 'https://github.com/LordMarte-A669/sciamn/releases/download/',
      // ultima APK pubblicata (la stessa della pagina di download)
      apk: 'https://github.com/LordMarte-A669/sciamn/releases/latest/download/uniplanner.apk'
    },
    // segnalazioni dall'app (docs/feedback.md): URL pubblico del Worker, nessun segreto.
    // Vuoto = funzione nascosta (prima del deploy).
    feedback: {
      url: 'https://uniplanner-api.mariomonterisi.workers.dev/v1/feedback'
    },
    // informativa privacy pubblica, pubblicata con la pagina di download
    privacy: 'https://lordmarte-a669.github.io/sciamn/privacy.html'
  };
});
