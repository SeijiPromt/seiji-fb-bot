// Libreng AI endpoint. Walang kailangang API key.

async function chat(messages) {
  try {
    const res = await fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages,
        model: "openai",
        seed: Math.floor(Math.random() * 1000000)
      })
    });
    
    if (!res.ok) throw new Error("AI server error");
    const text = await res.text();
    return text.trim();
  } catch (e) {
    return `[AI Error] Hindi makakonekta sa libreng AI. Subukan ulit mamaya. (${e.message})`;
  }
}

function buildMessages(cfg, history, userText) {
  const bits = [`You are a helpful assistant. Persona: ${cfg.persona}.`];
  if (cfg.system) bits.push(cfg.system);
  if (cfg.lang && cfg.lang !== "en") {
    bits.push(`Respond in language code: ${cfg.lang}.`);
  }
  bits.push("Keep replies concise. Messenger, not essay.");

  const messages = [{ role: "system", content: bits.join(" ") }];
  for (const m of history) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: userText });
  return messages;
}

module.exports = { chat, buildMessages };
