const ai = require("./ai");
const config = require("./config");

const HELP = [
  "--- AI COMMANDS ---",
  "!help           list",
  "!ai <prompt>    chat with AI",
  "!reset          clear AI context",
  "!persona <s>    set AI persona",
  "!stats          today's usage",
  "",
  "--- GROUP ADMIN ---",
  "!kick @user     kick mentioned user",
  "!add <uid>      add user by ID",
  "!admin @user    promote to admin",
  "!name <text>    change group name",
  "!rules          show group rules",
  "!on / !off      enable/disable bot reply"
].join("\n");

const busy = new Set();

function split(text, limit) {
  if (!text) return [];
  if (text.length <= limit) return [text];
  const out = [];
  for (let i = 0; i < text.length; i += limit) {
    out.push(text.slice(i, i + limit));
  }
  return out;
}

function send(api, event, text) {
  for (const chunk of split(text || "", 1900)) {
    api.sendMessage(chunk, event.threadID, () => {});
  }
}

function isAdmin(sender) {
  return config.ADMIN_IDS.includes(sender);
}

async function dispatch(api, event, store) {
  const tid = event.threadID;
  const body = event.body.slice(config.PREFIX.length).trim();
  if (!body) { send(api, event, HELP); return; }

  const parts = body.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(" ").trim();

  const handler = COMMANDS[cmd];
  if (!handler) {
    send(api, event, `unknown command: ${cmd}\ntry ${config.PREFIX}help`);
    return;
  }
  await handler(api, event, store, arg, event.senderID, tid);
}

async function handleAiMessage(api, event, store) {
  const tid = event.threadID;
  const sender = event.senderID;

  if (busy.has(tid)) return;
  busy.add(tid);

  try {
    const cfg = store.getThread(tid);
    const used = store.usageToday(tid);
    if (used >= config.DAILY_LIMIT && !isAdmin(sender)) {
      send(api, event, `daily limit reached (${config.DAILY_LIMIT}).`);
      return;
    }

    let text = event.body || "";
    if (event.mentions) {
      for (const [, name] of Object.entries(event.mentions)) {
        text = text.replace(`@${name}`, "").trim();
      }
    }
    if (!text) return;

    const history = store.history(tid, config.CONTEXT_TURNS * 2);
    const messages = ai.buildMessages(cfg, history, text);

    try { api.sendTypingIndicator(tid, () => {}); } catch (_) {}

    let reply = await ai.chat(messages);

    store.addMessage(tid, "user", text);
    store.addMessage(tid, "assistant", reply);
    store.bumpUsage(tid);

    send(api, event, reply);
  } finally {
    busy.delete(tid);
  }
}

const COMMANDS = {
  help: cmdHelp,
  ai: cmdAi,
  reset: cmdReset,
  persona: cmdPersona,
  stats: cmdStats,
  kick: cmdKick,
  add: cmdAdd,
  admin: cmdAdmin,
  name: cmdName,
  rules: cmdRules,
  on: cmdOn,
  off: cmdOff,
};

function cmdHelp(api, event) { send(api, event, HELP); }

function cmdReset(api, event, store, arg, sender, tid) {
  store.clearHistory(tid);
  send(api, event, "AI context cleared.");
}

async function cmdAi(api, event, store, arg) {
  if (!arg) { send(api, event, "usage: !ai <prompt>"); return; }
  try {
    const reply = await ai.chat([{ role: "user", content: arg }]);
    send(api, event, reply);
  } catch (e) {
    send(api, event, `ai error: ${e.message}`);
  }
}

function cmdPersona(api, event, store, arg, sender, tid) {
  if (!arg) { send(api, event, `persona: ${store.getThread(tid).persona}`); return; }
  store.setThread(tid, { persona: arg.slice(0, 200) });
  send(api, event, `persona set: ${arg.slice(0, 200)}`);
}

function cmdStats(api, event, store, arg, sender, tid) {
  const used = store.usageToday(tid);
  send(api, event, `today: ${used}/${config.DAILY_LIMIT} messages`);
}

// --- GROUP MANAGEMENT COMMANDS ---

function cmdKick(api, event, store, arg, sender, tid) {
  if (!event.isGroup) return send(api, event, "Group chat only.");
  const targetID = Object.keys(event.mentions)[0];
  if (!targetID) return send(api, event, "I-tag mo ang taong gusto mong i-kick. Hal: !kick @Name");
  
  api.removeUserFromGroup(targetID, tid, (err) => {
    if (err) send(api, event, "Failed to kick. Make sure the bot is an Admin.");
    else send(api, event, "User kicked from the group.");
  });
}

function cmdAdd(api, event, store, arg, sender, tid) {
  if (!event.isGroup) return send(api, event, "Group chat only.");
  if (!arg) return send(api, event, "I-type ang Facebook ID. Hal: !add 1000123456789");
  
  api.addUserToGroup(arg, tid, (err) => {
    if (err) send(api, event, "Failed to add. Make sure bot is Admin and user allows adding.");
    else send(api, event, `Added user ${arg} to the group.`);
  });
}

function cmdAdmin(api, event, store, arg, sender, tid) {
  if (!event.isGroup) return send(api, event, "Group chat only.");
  const targetID = Object.keys(event.mentions)[0];
  if (!targetID) return send(api, event, "I-tag mo ang taong gusto mong gawing admin. Hal: !admin @Name");
  
  api.changeAdminStatus(tid, targetID, true, (err) => {
    if (err) send(api, event, "Failed to promote. Make sure bot is Admin.");
    else send(api, event, "User promoted to Admin.");
  });
}

function cmdName(api, event, store, arg, sender, tid) {
  if (!event.isGroup) return send(api, event, "Group chat only.");
  if (!arg) return send(api, event, "I-type ang bagong pangalan. Hal: !name Tropa Hangout");
  
  api.setTitle(arg, tid, (err) => {
    if (err) send(api, event, "Failed to change name. Make sure bot is Admin.");
    else send(api, event, `Group name changed to: ${arg}`);
  });
}

function cmdRules(api, event) {
  send(api, event, "RULES:\n1. Respeto lang.\n2. Bawal spam.\n3. Bawal bastos.");
}

function cmdOn(api, event, store, arg, sender, tid) {
  if (!isAdmin(sender)) return send(api, event, "admin only");
  store.setThread(tid, { enabled: true });
  send(api, event, "Bot enabled for this thread.");
}

function cmdOff(api, event, store, arg, sender, tid) {
  if (!isAdmin(sender)) return send(api, event, "admin only");
  store.setThread(tid, { enabled: false });
  send(api, event, "Bot disabled for this thread.");
}

module.exports = { dispatch, handleAiMessage };
