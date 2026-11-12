const fs = require("fs");
const path = require("path");
const http = require("http");
const login = require("fca-unofficial");

const config = require("./config");
const { Store } = require("./store");
const { dispatch, handleAiMessage } = require("./commands");

const store = new Store(config.DB_PATH);
const START = Date.now();

let apiRef = null;

function loadAppstate() {
  if (process.env.APPSTATE) {
    const raw = process.env.APPSTATE.trim();
    if (raw.startsWith("[")) return JSON.parse(raw);
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  }
  const file = path.join(__dirname, "appstate.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  throw new Error("no appstate: set APPSTATE env or drop appstate.json");
}

async function handleEvent(api, event) {
  if (event.type !== "message" && event.type !== "message_reply") return;
  if (!event.body) return;
  if (event.senderID === api.getCurrentUserID()) return;

  const ts = parseInt(event.timestamp || "0", 10);
  if (ts && ts < START - 60_000) return;

  const tid = event.threadID;
  store.ensureThread(tid);
  const cfg = store.getThread(tid);

  if (event.body.startsWith(config.PREFIX)) {
    await dispatch(api, event, store);
    return;
  }

  if (!cfg.enabled) return;

  if (event.isGroup) {
    const mentions = event.mentions || {};
    const me = api.getCurrentUserID();
    if (!mentions[me]) return;
  }

  await handleAiMessage(api, event, store);
}

function startListener(api) {
  api.setOptions({
    listenEvents: true,
    selfListen: false,
    listenTyping: false,
    updatePresence: false,
    autoMarkRead: true,
    logLevel: "silent",
  });

  api.listenMqtt((err, event) => {
    if (err) {
      console.error("[mqtt]", err.error || err.message || err);
      setTimeout(() => startListener(api), 5000);
      return;
    }
    if (!event || !event.type) return;
    handleEvent(api, event).catch(e => {
      console.error("[handler]", e.message || e);
    });
  });
}

function boot() {
  let appState;
  try {
    appState = loadAppstate();
  } catch (e) {
    console.error("[boot]", e.message);
    process.exit(1);
  }

  login({ appState }, (err, api) => {
    if (err) {
      console.error("[login]", err.error || err);
      process.exit(1);
    }
    apiRef = api;
    console.log("[login] uid", api.getCurrentUserID());
    startListener(api);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      uid: apiRef ? apiRef.getCurrentUserID() : null,
      uptime: Math.floor((Date.now() - START) / 1000),
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(config.PORT, () => {
  console.log("[http] health on", config.PORT);
  boot();
});

process.on("unhandledRejection", e => console.error("[unhandled]", e));
process.on("uncaughtException", e => console.error("[uncaught]", e.message));
