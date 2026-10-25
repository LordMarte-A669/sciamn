# Sciamn — download e aggiornamenti

**Per installare l'app: <https://lordmarte-a669.github.io/sciamn/>** (è la pagina del QR code).

**Orario delle lezioni di ogni corso dell'Università di Bari, senza installare niente: <https://lordmarte-a669.github.io/sciamn/orari/>** (settimana in corso e prossima, aggiornate ogni mattina).

Questo repo contiene solo ciò che la CI del repo dei sorgenti (privato) pubblica a ogni versione.
Non si modifica niente a mano: anche la pagina di download (`index.html`, `qr.*`, `icon*`) è generata a ogni versione dalla CI, a partire da `site/` del repo dei sorgenti; le pagine orario (`orari/`) le rigenera ogni mattina il workflow `orari.yml`.

- **APK**: `uniplanner-X.Y.Z.apk` e la stessa col nome fisso `uniplanner.apk`, così
  `releases/latest/download/uniplanner.apk` porta sempre all'ultima.
- **Aggiornamenti automatici**: la parte web dell'app (`www/`) zippata, cifrata e firmata, più
  `manifest.json`. L'app installata li scarica da sola e scarta qualsiasi file non firmato dalla CI.
- `releases/latest/download/manifest.json` descrive l'ultima versione: numero, APK minima
  richiesta, URL dello zip e dell'APK, checksum firmato, chiave di sessione, novità.
