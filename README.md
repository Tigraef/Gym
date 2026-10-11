# Gym Tracker

Eine kleine Web-App, mit der du deine Geräte und dein Training über **mehrere Fitnessstudios** hinweg trackst – ohne die einzelnen Studio-Apps.

**Live:** https://tigraef.github.io/Gym/

## Funktionen
- **Studios** anlegen und pro Studio die **Geräte** erfassen (nach Kategorie, mit Einstellungen wie Sitzhöhe).
- **Training am Gerät**: Beim Öffnen eines Geräts (auch per QR-Scan) fragt die App „Training auf Gerät starten“. Du siehst dann Satz für Satz Gewicht und Wiederholungen (vorgeschlagen aus deinem letzten Training), passt sie mit −/＋ an, tippst „Satz erfolgreich beendet“ und danach „Nächster Satz“. Jeder Satz wird sofort mit dem heutigen Datum gespeichert.
- **Manuell nachtragen**: Trainings können auch nachträglich mit beliebigem Datum eingetragen werden.
- **Geräte verbinden**: Steht dasselbe Gerät in mehreren Studios, verbindest du es. Gewichte und Wiederholungen werden dann geteilt: Steigerst du dich in einem Studio, siehst du das im anderen Studio sofort. Einstellungen bleiben pro Studio getrennt.
- **QR-Code scannen**: Hat ein Gerät einen QR-Code, scannst du ihn einmal und ordnest ihn dem Gerät zu. Danach öffnet ein Scan (Kamera-Symbol oben) direkt die Seite dieses Geräts. Unbekannte Codes kannst du einem vorhandenen Gerät zuordnen oder gleich ein neues Gerät damit anlegen.
- **Verlauf und Bestwert** pro Gerät (bei verbundenen Geräten über alle Studios).
- **Offline nutzbar** und als App installierbar (im Browser „Zum Home-Bildschirm“).
- **Export/Import** als JSON-Datei, als Sicherung oder um die Daten auf ein anderes Gerät zu übertragen.
- **Synchronisation** zwischen Handy und PC über ein privates GitHub-Repository (⚙ → *Synchronisation*). Änderungen auf beiden Geräten werden automatisch zusammengeführt, auch nach Offline-Training.

## Drittanbieter
- [jsQR](https://github.com/cozmo/jsQR) 1.4.0 (Apache-2.0) in `vendor/` – QR-Erkennung, falls der Browser keinen eingebauten `BarcodeDetector` hat (z. B. iPhone).

## Daten
Alle Daten liegen im Browser (localStorage) auf deinem Gerät. Es gibt keinen eigenen Server. Exportiere regelmäßig eine Sicherung über ⚙ → *Exportieren*.

### Synchronisation einrichten (optional, kostenlos)
1. Auf [github.com/new](https://github.com/new) ein Repository anlegen, z. B. `gym-daten`, Sichtbarkeit **Private**.
2. Auf [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new) einen *Fine-grained token* erstellen: Ablaufdatum wählen, *Repository access* → „Only select repositories“ → `gym-daten`, *Permissions* → *Contents* → „Read and write“.
3. In der App unter ⚙ → *Synchronisation* Repository (`deinname/gym-daten`) und Token eintragen – auf jedem Gerät einmal.

Die App speichert dann `gym-tracker.json` in diesem Repository. Sie synchronisiert beim Öffnen, wenn sie wieder in den Vordergrund kommt und kurz nach jeder Änderung. Offline gemachte Änderungen werden übertragen, sobald wieder Netz da ist. Zusammengeführt wird pro Eintrag: Was nur auf einem Gerät geändert oder gelöscht wurde, wird übernommen; wurde derselbe Eintrag auf beiden Geräten geändert, gewinnt die neuere Änderung. Der Token bleibt nur im jeweiligen Browser und ist nicht Teil des Exports.

## Veröffentlichen
Reine statische Dateien ohne Build-Schritt. In GitHub unter *Settings → Pages* als Quelle „Deploy from a branch“, den Branch mit diesen Dateien und den Ordner `/ (root)` wählen.

Lokal testen: `python3 -m http.server` und dann http://localhost:8000 öffnen.
