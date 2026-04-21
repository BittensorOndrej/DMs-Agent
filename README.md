# 🤖 Instagram DM AI Agent

AI agent který odpovídá na tvoje Instagram DM zprávy přesně tvým stylem.

## Rychlé spuštění

### 1. Nainstaluj závislosti
```bash
npm install
```

### 2. Nastav environment proměnné
```bash
cp .env.example .env
```
Otevři `.env` a vyplň:
- `INSTAGRAM_ACCESS_TOKEN` — token z Meta Developer dashboardu
- `ANTHROPIC_API_KEY` — klíč z console.anthropic.com
- `VERIFY_TOKEN` — libovolný řetězec (např. `muj_tajny_token_123`)

### 3. Spusť server
```bash
npm start
```

### 4. Zpřístupni server na internetu (Render.com - ZDARMA)

1. Jdi na [render.com](https://render.com) a vytvoř účet
2. Klikni **New → Web Service**
3. Propoj svůj GitHub repo (nahraj tam tyto soubory)
4. Nastav:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. Přidej Environment Variables (INSTAGRAM_ACCESS_TOKEN, ANTHROPIC_API_KEY, VERIFY_TOKEN)
6. Deploy — dostaneš URL jako `https://tvuj-agent.onrender.com`

### 5. Nastav Webhook v Meta dashboardu

1. Jdi na [developers.facebook.com](https://developers.facebook.com)
2. Tvoje appka → **Instagram → Webhooks**
3. Klikni **Add Callback URL**
4. Zadej: `https://tvuj-agent.onrender.com/webhook`
5. Verify Token: stejný jako v `.env` (např. `muj_tajny_token_123`)
6. Zaškrtni **messages** a ulož

### 6. Získej Anthropic API klíč

1. Jdi na [console.anthropic.com](https://console.anthropic.com)
2. Vytvoř účet a jdi na **API Keys**
3. Klikni **Create Key** a zkopíruj ho do `.env`

## Hotovo! 🎉

Agent teď automaticky odpovídá na všechny příchozí DM zprávy tvým stylem.
