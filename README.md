# Var ska vi äta idag? 🍽️

En liten webbapp som hjälper gänget att bestämma var ni ska äta lunch.
Öppnar direkt på Västra Hamnen — ingen inloggning, ingen positionsdialog. Helt statisk,
inga konton, inga API-nycklar, ingen server — allt körs i webbläsaren och hostas gratis
på GitHub Pages.

## Vad den gör

- **Hittar riktiga lunchställen** via OpenStreetMap — inga kaféer, och
  snabbmatskedjorna (McDonald's, Subway, Max m.fl.) är bortfiltrerade
- **Tre sätt att bestämma:**
  - 🎲 **Slumpa** — ett ställe, direkt, klart
  - ⚔️ **Turnering** — 8 ställen, 7 dueller, vinnaren går vidare (bra när gruppen är oense).
    Urvalet viktas mot högt betyg, men inget är uteslutet
  - ⭐ **Favoriter** — spara ställen ni gillar och slumpa bara bland dem
- **Sökområde:** hela stadsdelen Västra Hamnen som standard (en radie missar
  Bo01 i ena änden), eller fritt avstånd från din position. Stadsdelsläget
  behöver ingen position — tryck 📍 om du vill ha avstånden räknade från dig
- **Filter:** kök, öppet nu, "inte nyss besökta" (kommer ihåg de senaste dagarna)
- **Google-betyg** där vi slagit upp dem (OSM lagrar inte betyg — listan i
  `RATINGS` fylls på för hand, se nedan)
- **Meny & info** per ställe — öppettider, telefon, menylänk, vägbeskrivning
- Mörkt/ljust tema, fungerar på mobil

## Om betygen

OpenStreetMap lagrar medvetet inga betyg, och Google Places API kräver
nyckel, fakturering och en server — vilket sidan inte har. Betygen är därför
uppslagna för hand och ligger i `RATINGS` i [assets/app.js](assets/app.js),
nycklade på restaurangens namn i gemener, med datum för kontrollen.

Ställen utan betyg visar ingen stjärna alls — hellre tomt än gissat. Vill du
fylla på eller uppdatera ett gammalt värde: slå upp stället (restaurantguru.com
listar Googles siffra separat i sin "Ratings of"-sektion) och lägg till en rad:

```js
'restaurangens namn': { r: 4.2, n: 310, at: '2026-09' },
```

Ta Googles siffra, inte sajtens egen — de skiljer sig ofta kraftigt.

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
