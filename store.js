const fs = require("fs");
const path = require("path");

class Store {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.data = this._load();
    this._dirty = false;
    setInterval(() => this._flush(), 1500).unref();
  }

  _load() {
    if (fs.existsSync(this.file)) {
      try {
        return JSON.parse(fs.readFileSync(this.file, "utf8"));
      } catch (_) {}
    }
    return { threads: {}, messages: {}, usage: {} };
  }

  _flush() {
    if (!this._dirty) return;
    this._dirty = false;
    const tmp = this.file + ".tmp";
    fs.writeFile(tmp, JSON.stringify(this.data, null, 2), () => {
      fs.rename(tmp, this.file, () => {});
    });
  }

  ensureThread(tid) {
    if (!this.data.threads[tid]) {
      this.data.threads[tid] = {
        persona: "friendly assistant",
        system: "",
        lang: "en",
        enabled: true,
        model: "",
      };
      this._dirty = true;
    }
  }

  getThread(tid) {
    this.ensureThread(tid);
    return this.data.threads[tid];
  }

  setThread(tid, kw) {
    this.ensureThread(tid);
    Object.assign(this.data.threads[tid], kw);
    this._dirty = true;
  }

  addMessage(tid, role, content) {
    if (!this.data.messages[tid]) this.data.messages[tid] = [];
    const arr = this.data.messages[tid];
    arr.push({ role, content, ts: Date.now() });
    if (arr.length > 20) this.data.messages[tid] = arr.slice(-20);
    this._dirty = true;
  }

  history(tid, limit = 16) {
    return (this.data.messages[tid] || []).slice(-limit);
  }

  clearHistory(tid) {
    this.data.messages[tid] = [];
    this._dirty = true;
  }

  bumpUsage(tid) {
    const day = new Date().toISOString().slice(0, 10);
    if (!this.data.usage[tid]) this.data.usage[tid] = {};
    this.data.usage[tid][day] = (this.data.usage[tid][day] || 0) + 1;
    this._dirty = true;
  }

  usageToday(tid) {
    const day = new Date().toISOString().slice(0, 10);
    return (this.data.usage[tid] && this.data.usage[tid][day]) || 0;
  }
}

module.exports = { Store };
