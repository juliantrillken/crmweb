# STOROJET CRM

Browserbasierte CRM-Anwendung für Kontakte, Kontakthistorie und Wiedervorlagen.

## Betrieb

Die App ist als statische Web-Anwendung ausgelegt und benötigt keinen Server, kein Python und keinen API-Key.

Die Kundendaten werden **nicht im Repository gespeichert**. Nach dem ersten Start werden vorhandene CRM-Daten per JSON importiert und ausschließlich im jeweiligen Browser in IndexedDB gespeichert.

## Funktionen

- Dashboard mit Kacheln für überfällige, heutige und kommende Doings
- Kontakte und Ansprechpartner
- Kontakthistorie mit Telefonat, E-Mail, Teams-Meeting, Vor-Ort-Termin und Notiz
- Automatisch ermittelter letzter Kontakt
- Doings und Wiedervorlagen
- Volltextsuche über Kontakte und Historie
- JSON-Import und JSON-Export
- lokale Sicherungsstände im Browser
- responsive Oberfläche

## GitHub Pages

Als Quelle für GitHub Pages den Branch `main` und den Ordner `/ (root)` verwenden.

Nach der Veröffentlichung ist die App typischerweise unter

`https://juliantrillken.github.io/crmweb/`

erreichbar.

## Datenschutz

Keine Kundendaten oder CRM-Backups in dieses Repository committen.
