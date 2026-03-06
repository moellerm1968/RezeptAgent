# RezeptAgent

Ein KI-gestützter Rezeptvorschlags-Agent auf Basis von Claude und Tavily Search.  
Rezepte werden auf Anfrage generiert, in einer lokalen JSON-Datenbank gespeichert und können optional per E-Mail versandt werden.  
Der integrierte MCP-Server ermöglicht die Nutzung als Tool in Claude Desktop oder anderen MCP-kompatiblen Clients.

---

## Features

- **On-Demand-Generierung** – Rezeptvorschläge per Texteingabe, keine automatischen Zeitpläne
- **KI-Suche** – Tavily sucht aktuelle Rezepte, Claude extrahiert Titel, Zutaten und Link
- **URL-Verifikation** – Generierte Links werden validiert; halluzinierte URLs werden automatisch unterdrückt
- **Zutaten-Einkaufsliste** – direkte Anzeige im Browser
- **Optionaler E-Mail-Versand** – erfordert SMTP-Konfiguration in `.env`
- **Rezept-Bewertung** – Schulnoten 1–6 pro Rezept
- **Löschfunktion** – Einzelne Einträge aus der Historie entfernen
- **MCP-Server** – 4 Tools über StreamableHTTP (`/mcp`) für Claude Desktop etc.
- **Docker-ready** – Einzeiler-Start mit Docker Compose

---

## Tech Stack

| Schicht      | Technologie                                      |
|--------------|--------------------------------------------------|
| Backend      | Node.js 20, Express 4                            |
| KI           | Anthropic Claude (`claude-haiku-4-5`), Tavily    |
| E-Mail       | Nodemailer (jeder SMTP-Provider)                 |
| Datenbank    | JSON-Datei (`data/db.json`) – kein Setup nötig   |
| Frontend     | Vue.js 3 (CDN, kein Build-Schritt)               |
| MCP          | `@modelcontextprotocol/sdk` v1.27.1              |
| Container    | Docker, Docker Compose                           |

---

## Voraussetzungen

- **Docker + Docker Compose** (empfohlener Weg)  
  *oder* Node.js ≥ 20 (für lokale Ausführung ohne Docker)
- Anthropic API-Key: <https://console.anthropic.com>
- Tavily API-Key: <https://app.tavily.com>
- Optional: SMTP-Zugangsdaten für E-Mail-Versand

---

## Installation

### Option A – Docker (empfohlen)

```bash
# 1. Repository klonen
git clone https://github.com/DEIN_USERNAME/RezeptAgent.git
cd RezeptAgent

# 2. Konfigurationsdatei anlegen
cp .env.example .env
# .env in einem Editor öffnen und API-Keys + SMTP-Daten eintragen

# 3. Starten
docker compose up -d

# App ist erreichbar unter http://localhost:3270
```

Container stoppen:
```bash
docker compose down
```

### Option B – Lokale Node.js-Ausführung

```bash
# 1. Repository klonen
git clone https://github.com/DEIN_USERNAME/RezeptAgent.git
cd RezeptAgent

# 2. Abhängigkeiten installieren
npm install

# 3. Konfigurationsdatei anlegen
cp .env.example .env
# .env öffnen und API-Keys eintragen

# 4. Starten
npm start

# App ist erreichbar unter http://localhost:3270
```

---

## Konfiguration

Alle Einstellungen erfolgen über `.env` (Vorlage: `.env.example`).

| Variable             | Pflicht | Beschreibung                                               |
|----------------------|---------|------------------------------------------------------------|
| `ANTHROPIC_API_KEY`  | ✅       | Anthropic API-Schlüssel                                    |
| `TAVILY_API_KEY`     | ✅       | Tavily Search API-Schlüssel                               |
| `PORT`               | –       | HTTP-Port (Standard: `3270`)                               |
| `DB_PATH`            | –       | Pfad zur JSON-Datenbank (Standard: `data/db.json`)         |
| `SMTP_HOST`          | –       | SMTP-Server (z. B. `smtp.gmail.com`)                       |
| `SMTP_PORT`          | –       | SMTP-Port (Standard: `587`)                                |
| `SMTP_USER`          | –       | SMTP-Benutzername / E-Mail-Adresse                         |
| `SMTP_PASS`          | –       | SMTP-Passwort oder App-Passwort                            |
| `EMAIL_FROM`         | –       | Absenderadresse (Standard: Wert von `SMTP_USER`)           |
| `EMAIL_TO`           | –       | Standard-Empfängeradresse für E-Mails                      |

> Ohne SMTP-Variablen erscheint die Schaltfläche „Per E-Mail senden" ausgegraut und ist deaktiviert.

---

## MCP-Server

Der integrierte MCP-Server ist über **StreamableHTTP** erreichbar:

```
POST/GET/DELETE http://localhost:3270/mcp
```

### Tools

| Tool                      | Parameter                                       | Beschreibung                                            |
|---------------------------|-------------------------------------------------|---------------------------------------------------------|
| `erzeuge_vorschlag`       | `prompt` (string, max 200 Zeichen)              | Rezeptvorschlag generieren und in DB speichern          |
| `versende_vorschlag`      | `recipeId` (UUID), `email` (optional)           | Gespeichertes Rezept per E-Mail versenden               |
| `zeige_bisherige_gerichte`| –                                               | Alle gespeicherten Rezepte auflisten                    |
| `bewerte_gericht`         | `recipeId` (UUID), `rating` (1–6)               | Schulnote für ein Rezept speichern                      |

### Claude Desktop – Konfiguration

```json
{
  "mcpServers": {
    "RezeptAgent": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3270/mcp"]
    }
  }
}
```

---

## REST-API (Übersicht)

| Methode | Endpunkt                         | Beschreibung                       |
|---------|----------------------------------|------------------------------------|
| GET     | `/api/recipes`                   | Alle Rezepte abrufen               |
| POST    | `/api/recipes/generate`          | Neues Rezept generieren            |
| GET     | `/api/recipes/:id`               | Einzelnes Rezept abrufen           |
| DELETE  | `/api/recipes/:id`               | Rezept löschen                     |
| PUT     | `/api/recipes/:id/rating`        | Bewertung speichern                |
| POST    | `/api/recipes/:id/send-email`    | Rezept per E-Mail versenden        |
| GET     | `/api/config`                    | Aktuelle Konfiguration abrufen     |
| PUT     | `/api/config`                    | Konfiguration aktualisieren        |
| GET     | `/api/health`                    | Systemstatus                       |

---

## Sicherheitshinweis

> **Wichtig:** Bevor du das Repository veröffentlichst (z. B. als öffentliches GitHub-Repo),  
> stelle sicher, dass **keine echten API-Keys oder Passwörter** in den Git-Verlauf eingecheckt wurden.  
>  
> Die `.env`-Datei ist in `.gitignore` ausgeschlossen. Wenn du zuvor eine `.env` committed hast,  
> rotiere alle Credentials (Anthropic, Tavily, SMTP-Passwort) sofort über die jeweiligen Konsolen.

---

## Lizenz

MIT
