# Gym Tracker

Eine kleine Web-App, mit der du deine Geräte und dein Training über **mehrere Fitnessstudios** hinweg trackst – ohne die einzelnen Studio-Apps.

**Live:** https://tigraef.github.io/Gym/

## Funktionen
- **Studios** anlegen und pro Studio die **Geräte** erfassen (nach Kategorie, mit Einstellungen wie Sitzhöhe).
- **Training eintragen**: Sätze mit Gewicht und Wiederholungen. Das Formular ist mit deinem letzten Training vorausgefüllt.
- **Geräte verbinden**: Steht dasselbe Gerät in mehreren Studios, verbindest du es. Gewichte und Wiederholungen werden dann geteilt: Steigerst du dich in einem Studio, siehst du das im anderen Studio sofort. Einstellungen bleiben pro Studio getrennt.
- **Verlauf und Bestwert** pro Gerät (bei verbundenen Geräten über alle Studios).
- **Offline nutzbar** und als App installierbar (im Browser „Zum Home-Bildschirm“).
- **Export/Import** als JSON-Datei, als Sicherung oder um die Daten auf ein anderes Gerät zu übertragen.

## Daten
Alle Daten liegen nur im Browser (localStorage) auf deinem Gerät. Es gibt keinen Server und keinen Account. Exportiere regelmäßig eine Sicherung über ⚙ → *Exportieren*.

## Veröffentlichen
Reine statische Dateien ohne Build-Schritt. In GitHub unter *Settings → Pages* als Quelle „Deploy from a branch“, den Branch mit diesen Dateien und den Ordner `/ (root)` wählen.

Lokal testen: `python3 -m http.server` und dann http://localhost:8000 öffnen.
