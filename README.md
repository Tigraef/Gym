# Gym Tracker

Eine kleine Web-App, mit der du deine Geräte und dein Training über **mehrere Fitnessstudios** hinweg trackst – ohne die einzelnen Studio-Apps.

**Live:** https://tigraef.github.io/Gym/

## Funktionen
- **Studios** anlegen und pro Studio die **Geräte** erfassen (nach Kategorie, mit Einstellungen wie Sitzhöhe).
- **Training eintragen**: Sätze mit Gewicht und Wiederholungen. Das Formular ist mit deinem letzten Training vorausgefüllt.
- **Geräte verbinden**: Steht dasselbe Gerät in mehreren Studios, verbindest du es. Gewichte und Wiederholungen werden dann geteilt: Steigerst du dich in einem Studio, siehst du das im anderen Studio sofort. Einstellungen bleiben pro Studio getrennt.
- **QR-Code scannen**: Hat ein Gerät einen QR-Code, scannst du ihn einmal und ordnest ihn dem Gerät zu. Danach öffnet ein Scan (Kamera-Symbol oben) direkt die Seite dieses Geräts. Unbekannte Codes kannst du einem vorhandenen Gerät zuordnen oder gleich ein neues Gerät damit anlegen.
- **Verlauf und Bestwert** pro Gerät (bei verbundenen Geräten über alle Studios).
- **Offline nutzbar** und als App installierbar (im Browser „Zum Home-Bildschirm“).
- **Export/Import** als JSON-Datei, als Sicherung oder um die Daten auf ein anderes Gerät zu übertragen.

## Drittanbieter
- [jsQR](https://github.com/cozmo/jsQR) 1.4.0 (Apache-2.0) in `vendor/` – QR-Erkennung, falls der Browser keinen eingebauten `BarcodeDetector` hat (z. B. iPhone).

## Daten
Alle Daten liegen nur im Browser (localStorage) auf deinem Gerät. Es gibt keinen Server und keinen Account. Exportiere regelmäßig eine Sicherung über ⚙ → *Exportieren*.

## Veröffentlichen
Reine statische Dateien ohne Build-Schritt. In GitHub unter *Settings → Pages* als Quelle „Deploy from a branch“, den Branch mit diesen Dateien und den Ordner `/ (root)` wählen.

Lokal testen: `python3 -m http.server` und dann http://localhost:8000 öffnen.
