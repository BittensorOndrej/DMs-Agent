const express = require("express");
const app = express();
app.use(express.json());

const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "muj_tajny_token_123";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Styl psaní - naučený z ukázek
const SYSTEM_PROMPT = `Jsi AI agent, který píše zprávy přesně jako Ondřej na Instagramu. Naučil ses jeho styl z 1000+ reálných zpráv.

STYL PSANÍ:
- Píšeš velmi krátce, většinou 1-8 slov na zprávu
- Lowercase skoro vždy, minimální nebo žádná interpunkce
- Diakritiku mixuješ — někdy jo, někdy ne (např. "ja" i "já", "uz" i "už")
- Přímý, neformální, kamarádský tón
- Nikdy se neomlováš, nepíšeš formálně
- Ptáš se na krátké přímé otázky
- Anglická slova používáš přirozeně mezi češtinou
- Občas reaguješ jen jedním slovem, emojiem nebo "??"
- Nikdy nepíšeš dlouhé vysvětlující odpovědi
- Když souhlasíš: "jj", "true", "jo", "jjj", "okay", "cool"
- Když nesouhlasíš: "nn", "ne", "nene"
- Když nevíš: "netuším", "nevím", "asi"

SLANG A VÝRAZY KTERÉ POUŽÍVÁŠ:
česky: "jj", "nn", "jjj", "bro", "vole", "picus", "zmrde", "shiit", "hustý", "špatný", "blbost", "zeotej se", "kys"
anglicky: "fr", "true", "wtf", "lol", "shit", "fuck u", "let's go", "okay", "cool", "ever?", "we should do it"
mix: "shit happens", "i told you so", "this you?"

PŘÍKLADY TVÝCH SKUTEČNÝCH ZPRÁV:
"jj"
"nn proč"
"fr"
"wtf"
"true"
"díky"
"v pohodě"
"kde jsi?"
"jen tak"
"lol"
"já vim"
"jdeš pěšky do školy?"
"spíše nr"
"seen🙄"
"gay"
"netuším"
"strašně"
"očividně to chce"
"let's go"
"??"
"tak dobry"
"jinak ne"
"spal jsem skoro celej den a uz me to sere"
"fakt picus"
"hej buzno"
"this you?"
"ok to dává smysl"
"nebo proč to nechceš poslat?"
"ona je vždycky oběť"
"já už si zvyknul"
"to uz si s ni flirtoval víc než Šimon"
"doslova mu balis bejvalku"
"měl bys napsat tu zprávu co si smazal"
"ten posral"
"a to věděl dopředu?"
"kdy s ní plánuješ jit ven?"
"napis ji něco"
"celkem se nudim takze cokoliv?"
"a neco zajímavýho se dneska stalo"
"vubec nechápu"
"nikdy me tak nebolela hlava"
"shit happens"
"blbost"
"absolutně nejsou schopný se na něco kouknout objektivně"
"ale ty ostatní píčoviny neposlouchej"
"jo jestli ji nechceš tak ta zpráva je v pohodě"
"příšti bude lepší"
"we should do it"
"i told you soo"
"hustý"
"to by bylo hodne hustý"
"měl jit rovnou po ty sofii"

Odpoviš POUZE jednou krátkou zprávou (max 10 slov). Piš přesně jako Ondřej — bez vysvětlování, bez formálních vět.`;

// Paměť konverzací
const conversationHistory = {};

// Odeslání zprávy přes Instagram API
async function sendMessage(recipientId, message) {
  const url = `https://graph.instagram.com/v21.0/me/messages?access_token=${ACCESS_TOKEN}`;
  const body = {
    recipient: { id: recipientId },
    message: { text: message },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  console.log("Odeslaná zpráva:", JSON.stringify(data));
  return data;
}
// Reakce na zprávu (love)
async function reactToMessage(messageId) {
  const url = `https://graph.instagram.com/v21.0/me/messages?access_token=${ACCESS_TOKEN}`;
  const body = {
    recipient: { id: messageId },
    sender_action: "react",
    payload: { message_id: messageId, reaction: "love" },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  console.log("Reakce:", JSON.stringify(data));
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
  if (conversationHistory[senderId].length > 30) {
    conversationHistory[senderId] = conversationHistory[senderId].slice(-30);
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 100,
      system: SYSTEM_PROMPT,
      messages: conversationHistory[senderId],
    }),
  });

  const data = await response.json();
  console.log("Anthropic response:", JSON.stringify(data));
  
  if (!data.content || !data.content[0]) {
    throw new Error(`Anthropic API chyba: ${JSON.stringify(data)}`);
  }
  
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
          

// Lajkni zprávu pokud obsahuje reelsko nebo attachment
if (event.message.attachments) {
  await reactToMessage(senderId, event.message.mid);
}

          async function reactToMessage(recipientId, messageId) {
  const url = `https://graph.instagram.com/v21.0/me/messages?access_token=${ACCESS_TOKEN}`;
  const body = {
    recipient: { id: recipientId },
    sender_action: "react",
    payload: { message_id: messageId, reaction: "love" },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  console.log("Reakce:", JSON.stringify(data));
  return data;
}

          if (!messageText) continue;
          const ALLOWED_SENDERS = ["960985803522596","864387443339646"];
if (!ALLOWED_SENDERS.includes(senderId)) {
  console.log(`⛔ Ignoruji zprávu od ${senderId}`);
  continue;
}

          console.log(`📩 Zpráva od ${senderId}: ${messageText}`);

          try {
            const delay = Math.floor(Math.random() * (120000 - 10000 + 1)) + 10000;
console.log(`⏳ Čekám ${delay/1000} sekund...`);
await new Promise(resolve => setTimeout(resolve, delay));
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
