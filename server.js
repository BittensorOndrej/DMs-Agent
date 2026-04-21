const express = require("express");
const app = express();
app.use(express.json());

const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "muj_tajny_token_123";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Styl psaní - naučený z ukázek
const SYSTEM_PROMPT = `Jsi AI agent, který píše zprávy přesně jako tento člověk na Instagramu.

STYL PSANÍ:
- Píšeš velmi krátce, většinou 1-5 slov na zprávu
- Posíláš víc zpráv za sebou místo jedné dlouhé
- Používáš "nn" místo "ne ne" nebo "nene"
- Používáš "fr" (for real), "shiit", "true", "bro", "vole"
- Lowercase skoro vždy, minimální interpunkce
- Bez diakritiky občas (nemusíš, ale občas vynecháš)
- Ptáš se na krátké přímé otázky
- Reaguješ přirozeně, kamarádsky
- Jsi zvědavý na život ostatních, ptáš se na otázky
- Občas pošleš jen "gay" nebo jiné jednoduché reakce jako emoji/slovo
- Nikdy nepíšeš dlouhé formální odpovědi
- Nikdy nevysvětluješ věci do hloubky

PŘÍKLADY TVÉHO PSANÍ:
"nn"
"fr bys měl"
"co říkal?"
"true shit"
"shiit"
"mas do půlnoci"
"tak to je v pohodě"
"proč najs?"
"ale takhle"

Odpoviš POUZE jednou krátkou zprávou (max 10 slov). Žádné vysvětlování, žádné dlouhé věty.`;

// Paměť konverzací
const conversationHistory = {};

// Odeslání zprávy přes Instagram API
async function sendMessage(recipientId, message) {
  const url = `https://graph.instagram.com/v21.0/me/messages`;
  const body = {
    recipient: { id: recipientId },
    message: { text: message },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  console.log("Odeslaná zpráva:", data);
  return data;
}

// Generování odpovědi pomocí Claude AI
async function generateReply(senderId, userMessage) {
  if (!conversationHistory[senderId]) {
    conversationHistory[senderId] = [];
  }

  conversationHistory[senderId].push({
    role: "user",
    content: userMessage,
  });

  // Drž max 20 zpráv v historii
  if (conversationHistory[senderId].length > 20) {
    conversationHistory[senderId] = conversationHistory[senderId].slice(-20);
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      system: SYSTEM_PROMPT,
      messages: conversationHistory[senderId],
    }),
  });

  const data = await response.json();
  const reply = data.content[0].text;

  conversationHistory[senderId].push({
    role: "assistant",
    content: reply,
  });

  return reply;
}

// Webhook verifikace (Meta to vyžaduje při nastavení)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Příjem zpráv
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "instagram") {
    for (const entry of body.entry) {
      const messagingEvents = entry.messaging;
      if (!messagingEvents) continue;

      for (const event of messagingEvents) {
        if (event.message && !event.message.is_echo) {
          const senderId = event.sender.id;
          const messageText = event.message.text;

          if (!messageText) continue;

          console.log(`📩 Zpráva od ${senderId}: ${messageText}`);

          try {
            const reply = await generateReply(senderId, messageText);
            console.log(`💬 Odpověď: ${reply}`);
            await sendMessage(senderId, reply);
          } catch (err) {
            console.error("Chyba při generování odpovědi:", err);
          }
        }
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "✅ Instagram DM Agent běží!", timestamp: new Date() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server běží na portu ${PORT}`);
});
