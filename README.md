# Var ska vi äta idag? 🍽️

En liten webbapp som hjälper gänget att bestämma var ni ska äta lunch.
Utgår från din position. Helt statisk,
inga konton, inga API-nycklar, ingen server — allt körs i webbläsaren och hostas gratis
på GitHub Pages.

## Vad den gör

- **Hittar riktiga lunchställen** runt dig via OpenStreetMap — inga kaféer, och
  snabbmatskedjorna (McDonald's, Subway, Max m.fl.) är bortfiltrerade
- **Tre sätt att bestämma:**
  - 🎲 **Slumpa** — ett ställe, direkt, klart
  - ⚔️ **Turnering** — två i taget, ni väljer, vinnaren går vidare (bra när gruppen är oense)
  - ⭐ **Favoriter** — spara ställen ni gillar och slumpa bara bland dem
- **Filter:** avstånd (750 m som standard), kök, öppet nu, "inte nyss besökta" (kommer ihåg de senaste dagarna)
- **Meny & info** per ställe — öppettider, telefon, menylänk, vägbeskrivning
- Mörkt/ljust tema, fungerar på mobil

## Om menyerna

OpenStreetMap innehåller ingen menydata, och det finns inget gratis API som täcker
svenska lunchmenyer. Appen gör därför det bästa möjliga utan server:

1. Om stället har en `menu`-tagg i OSM (ovanligt men förekommer) — direktlänk till menyn
2. Annars restaurangens **hemsida** från OSM, ett klick från menyn
3. Alltid en **"Sök dagens lunch"**-knapp som söker på namn + adress

Att skrapa restaurangernas sidor skulle kräva en backend, bryta mot många sajters
villkor, och gå sönder så fort någon gör om sin webbplats. Länkarna är tråkigare men
de fungerar varje dag.

## Kör lokalt

Ingen build, inga beroenden att installera:

```bash
python -m http.server 8000
# öppna http://localhost:8000
```

(Öppna inte `index.html` direkt via `file://` — webbläsaren blockerar då anropen.)

## Publicera på GitHub Pages

1. Pusha till GitHub
2. **Settings → Pages → Source: GitHub Actions**
3. Klart — workflowen i `.github/workflows/deploy.yml` publicerar vid varje push till `main`

Sidan hamnar på `https://<användarnamn>.github.io/<repo>/`.

## Datakällor

| Tjänst | Används till | Kostnad |
|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/) | kartbilder | gratis |
| [Overpass API](https://overpass-api.de/) | restaurangdata | gratis, ingen nyckel |
| [Nominatim](https://nominatim.org/) | platssökning | gratis, ingen nyckel |
| [Leaflet](https://leafletjs.com/) | kartkomponent | öppen källkod |

Appen roterar mellan tre Overpass-speglar om någon är överbelastad. Vid tung
användning gäller respektive tjänsts [användarvillkor](https://operations.osmfoundation.org/policies/nominatim/).

## Filer

```
index.html        # struktur
assets/style.css  # tema och layout
assets/app.js     # datahämtning, filter, karta, beslutslägen
```

Data från OpenStreetMap-bidragsgivare, [ODbL](https://www.openstreetmap.org/copyright).
