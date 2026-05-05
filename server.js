const express = require("express");
const app = express();
app.use(express.json());

const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "muj_tajny_token_123";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `Jsi AI agent, který píše zprávy přesně jako Ondřej na Instagramu. Naučil ses jeho styl z 1000+ reálných zpráv.

STYL PSANÍ (naučený z reálných konverzací):
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
"jj", "nn proč", "fr", "wtf", "true", "díky", "v pohodě", "kde jsi?", "jen tak", "lol",
"já vim", "jdeš pěšky do školy?", "spíše nr", "seen🙄", "gay", "netuším", "strašně",
"očividně to chce", "let's go", "??", "tak dobry", "jinak ne",
"spal jsem skoro celej den a uz me to sere", "fakt picus", "hej buzno", "this you?",
"ok to dává smysl", "nebo proč to nechceš poslat?", "ona je vždycky oběť",
"já už si zvyknul", "ten posral", "a to věděl dopředu?", "kdy s ní plánuješ jit ven?",
"napis ji něco", "vubec nechápu", "nikdy me tak nebolela hlava", "shit happens",
"absolutně nejsou schopný se na něco kouknout objektivně", "příšti bude lepší",
"we should do it", "hustý", "to by bylo hodne hustý", "měl jit rovnou po ty sofii"

DŮLEŽITÉ PRAVIDLO PRO FORMÁT ODPOVĚDI:
Rozhodneš se sám kolik zpráv pošleš podle situace — vždy jinak, přirozeně jako člověk.
- Někdy stačí 1 krátká zpráva
- Někdy pošleš 2-3 zprávy za sebou když chceš říct víc věcí
- Maximálně 4 zprávy
- Zprávy odděluj znakem | (pipe)
- Každá zpráva max 10 slov

Příklady formátu:
"jj"
"wtf|to je hustý"
"nn|proc by to delal|to nedava smysl"`;

const conversationHistory = {};
const messageBuffer = {};

// Časy zpráv pro detekci instantního režimu
const messageTimes = {};

// Stav spánku (generuje se každý den)
let sleepState = null;
let trainingState = null;

function getCzechTime() {
  // UTC+1 (zima) nebo UTC+2 (léto)
  const now = new Date();
  const offset = isDST(now) ? 2 : 1;
  return new Date(now.getTime() + offset * 60 * 60 * 1000);
}

function isDST(date) {
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  return date.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
}

function getDayOfWeek(czechTime) {
  return czechTime.getDay(); // 0=ne, 1=po, 2=ut, 3=st, 4=ct, 5=pa, 6=so
}

function getMinutes(czechTime) {
  return czechTime.getHours() * 60 + czechTime.getMinutes();
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generuj stav spánku pro dnešek
function getSleepState(czechTime) {
  const dateKey = czechTime.toISOString().slice(0, 10);
  if (sleepState && sleepState.dateKey === dateKey) return sleepState;

  const day = getDayOfWeek(czechTime);
  // Spánek začíná mezi 21:00 (1260 min) a 1:00 (25:00 = 1500 min next day)
  const sleepStartMin = randomBetween(1260, 1380); // 21:00 - 23:00 pro jednoduchost
  const sleepDurationMin = randomBetween(360, 480); // 6-8 hodin

  // Vstávání podle dne
  let wakeUpMin;
  if ([1, 3, 4, 5].includes(day)) {
    // Po, St, Čt, Pá — nejpozději 6:50
    wakeUpMin = randomBetween(360, 410); // 6:00 - 6:50
  } else if (day === 2) {
    // Út — může spát déle
    wakeUpMin = sleepStartMin + sleepDurationMin > 1440
      ? (sleepStartMin + sleepDurationMin) - 1440
      : sleepStartMin + sleepDurationMin;
  } else {
    // Víkend — může spát déle
    wakeUpMin = sleepStartMin + sleepDurationMin > 1440
      ? (sleepStartMin + sleepDurationMin) - 1440
      : sleepStartMin + sleepDurationMin;
  }

  sleepState = { dateKey, sleepStartMin, sleepDurationMin, wakeUpMin };
  return sleepState;
}

// Generuj trénink pro dnešek
function getTrainingState(czechTime) {
  const dateKey = czechTime.toISOString().slice(0, 10);
  if (trainingState && trainingState.dateKey === dateKey) return trainingState;

  const day = getDayOfWeek(czechTime);
  const isWeekend = day === 0 || day === 6;

  // Školní bloky pro každý den (minuty)
  const schoolBlocks = {
    1: [[470, 750], [855, 950]],   // Po: 7:50-12:30, 14:15-15:50
    2: [[585, 850]],                // Út: 9:45-14:10
    3: [[470, 750], [850, 950]],   // St: 7:50-12:30, 14:10-15:50
    4: [[470, 850]],                // Čt: 7:50-14:10
    5: [[470, 800]],                // Pá: 7:50-13:20
    0: [],                          // Ne
    6: [],                          // So
  };

  let trainingStart, trainingDuration;
  trainingDuration = randomBetween(40, 120);

  if (isWeekend) {
    // Víkend — kdykoliv 8:00-21:00
    trainingStart = randomBetween(480, 1260 - trainingDuration);
  } else {
    // Všední — 15:00-20:00, nesmí kolidovat se školou
    const blocks = schoolBlocks[day] || [];
    let attempts = 0;
    do {
      trainingStart = randomBetween(900, 1200 - trainingDuration);
      const trainingEnd = trainingStart + trainingDuration;
      const collides = blocks.some(([s, e]) => trainingStart < e && trainingEnd > s);
      if (!collides) break;
      attempts++;
    } while (attempts < 20);
  }

  trainingState = { dateKey, trainingStart, trainingEnd: trainingStart + trainingDuration };
  return trainingState;
}

// Zjisti aktuální režim
function getCurrentMode(senderId) {
  const czechTime = getCzechTime();
  const currentMin = getMinutes(czechTime);
  const day = getDayOfWeek(czechTime);

  const sleep = getSleepState(czechTime);
  const training = getTrainingState(czechTime);

  // Spánek
  if (currentMin >= sleep.sleepStartMin || currentMin < sleep.wakeUpMin) {
    return "sleep";
  }

  // Škola
  const schoolBlocks = {
    1: [[470, 750], [855, 950]],
    2: [[585, 850]],
    3: [[470, 750], [850, 950]],
    4: [[470, 850]],
    5: [[470, 800]],
    0: [],
    6: [],
  };
  const blocks = schoolBlocks[day] || [];
  for (const [start, end] of blocks) {
    if (currentMin >= start && currentMin < end) {
      return "school";
    }
  }

  // Trénink
  if (currentMin >= training.trainingStart && currentMin < training.trainingEnd) {
    return "training";
  }

  // Instantní (18:00 - začátek spánku)
  if (currentMin >= 1080 && currentMin < sleep.sleepStartMin) {
    if (isInstantMode(senderId)) {
      return "instant";
    }
  }

  // Zbytek
  return "rest";
}

// Detekce instantního režimu podle rychlosti psaní
function isInstantMode(senderId) {
  const times = messageTimes[senderId] || [];
  if (times.length < 3) return false;

  const recent = times.slice(-3);
  let fastCount = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] - recent[i-1] < 60000) fastCount++; // do 1 minuty
  }
  return fastCount >= 1; // aspoň každá 3. zpráva rychle
}

// Vypočítej zpoždění podle režimu
function getDelay(mode) {
  switch (mode) {
    case "sleep":
    case "training":
      return null; // neodpovídej

    case "instant":
      return randomBetween(5000, 20000); // 5-20s

    case "school": {
      // Náhodně — buď rychle nebo dlouho
      const fast = Math.random() < 0.2; // 20% šance na rychlou odpověď
      if (fast) return randomBetween(5000, 30000);
      return randomBetween(1800000, 14400000); // 30min - 4hod
    }

    case "rest":
    default:
      return randomBetween(240000, 2280000); // 4-38 minut
  }
}

async function sendMessage(recipientId, message) {
  const url = `https://graph.instagram.com/v21.0/me/messages?access_token=${ACCESS_TOKEN}`;
  const body = {
    recipient: { id: recipientId },
    message: { text: message },
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  console.log("Odeslaná zpráva:", JSON.stringify(data));
  return data;
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

async function generateReply(senderId, userMessage) {
  if (!conversationHistory[senderId]) {
    conversationHistory[senderId] = [];
  }
  conversationHistory[senderId].push({ role: "user", content: userMessage });
  if (conversationHistory[senderId].length > 50) {
    conversationHistory[senderId] = conversationHistory[senderId].slice(-50);
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
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
  conversationHistory[senderId].push({ role: "assistant", content: reply });
  return reply;
}

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

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

          // Sleduj časy zpráv pro instantní režim
          if (!messageTimes[senderId]) messageTimes[senderId] = [];
          messageTimes[senderId].push(Date.now());
          if (messageTimes[senderId].length > 10) {
            messageTimes[senderId] = messageTimes[senderId].slice(-10);
          }

          // Reakce na reelsko
          if (event.message.attachments) {
            const reactDelay = randomBetween(5000, 30000);
            await new Promise(resolve => setTimeout(resolve, reactDelay));
            await reactToMessage(senderId, event.message.mid);
          }

          if (!messageText) continue;

          const ALLOWED_SENDERS = ["960985803522596", "864387443339646"];
          if (!ALLOWED_SENDERS.includes(senderId)) {
            console.log(`Ignoruji zprávu od ${senderId}`);
            continue;
          }

          console.log(`Zpráva od ${senderId}: ${messageText}`);

          // Buffer — sbírej zprávy 30 sekund
          if (!messageBuffer[senderId]) {
            messageBuffer[senderId] = { messages: [], timer: null };
          }
          messageBuffer[senderId].messages.push(messageText);

          if (messageBuffer[senderId].timer) {
            clearTimeout(messageBuffer[senderId].timer);
          }

          messageBuffer[senderId].timer = setTimeout(async () => {
            const messages = [...messageBuffer[senderId].messages];
            delete messageBuffer[senderId];

            const combinedMessage = messages.join("\n");
            const mode = getCurrentMode(senderId);
            const delay = getDelay(mode);

            console.log(`Režim: ${mode}, zpoždění: ${delay ? delay/1000 + 's' : 'neodpovídám'}`);

            if (delay === null) {
              console.log("Jsem ve spánku nebo tréninku, neodpovídám.");
              return;
            }

            try {
              await new Promise(resolve => setTimeout(resolve, delay));

              // Po čekání znovu zkontroluj režim — možná skončil spánek/trénink
              const modeAfter = getCurrentMode(senderId);
              if (modeAfter === "sleep" || modeAfter === "training") {
                console.log("Stále v neaktivním režimu, přeskakuji.");
                return;
              }

              const reply = await generateReply(senderId, combinedMessage);
              console.log(`Odpověď: ${reply}`);

              const parts = reply.split("|").map(p => p.trim()).filter(p => p.length > 0);
              for (let i = 0; i < parts.length; i++) {
                await sendMessage(senderId, parts[i]);
                if (i < parts.length - 1) {
                  const pause = randomBetween(1000, 3000);
                  await new Promise(resolve => setTimeout(resolve, pause));
                }
              }
            } catch (err) {
              console.error("Chyba:", err);
            }
          }, 30000);
        }
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

app.get("/", (req, res) => {
  const czechTime = getCzechTime();
  const mode = getCurrentMode("test");
  res.json({ status: "Instagram DM Agent běží!", mode, czechTime });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server běží na portu ${PORT}`);
});
