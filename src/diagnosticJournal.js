// A bounded journal with immediate local checkpoints and durable crash recovery.
const KEY = "prompterson-capture-journal-v2";
const ENABLED = "prompterson-capture-diagnostics-enabled";
const LEGACY = "prompterson-capture-audit";

function browserStorage(name) {
  try { return globalThis[name]; } catch { return null; }
}

export function diagnosticsRequested(search, storage = browserStorage("localStorage")) {
  const choice = new URLSearchParams(search).get("recordingDiagnostics");
  try {
    if (choice === "1") storage?.setItem(ENABLED, "1");
    if (choice === "0") storage?.removeItem(ENABLED);
    return choice === "1" || (choice !== "0" && storage?.getItem(ENABLED) === "1");
  } catch {
    return choice === "1";
  }
}

function openDurableJournal() {
  if (!globalThis.indexedDB) return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("prompterson-capture-diagnostics", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("snapshots");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function readDurable(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("snapshots", "readonly");
    const read = tx.objectStore("snapshots").get("journal");
    tx.oncomplete = () => resolve(read.result);
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}

function writeDurable(db, value) {
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction("snapshots", "readwrite", { durability: "strict" }); }
    catch { tx = db.transaction("snapshots", "readwrite"); }
    tx.objectStore("snapshots").put(value, "journal");
    tx.oncomplete = () => resolve(tx.durability === "strict" ? "strict" : "browser-default");
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
export function createDiagnosticJournal({
  storage = browserStorage("localStorage"),
  legacyStorage = browserStorage("sessionStorage"),
  now = () => new Date().toISOString(),
} = {}) {
  let journal = {};
  let persistence = "memory-only";
  let durability = "pending";
  try {
    const saved = storage?.getItem(KEY) ?? legacyStorage?.getItem(LEGACY);
    const parsed = JSON.parse(saved || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) journal = parsed;
  } catch { /* Keep collection available if previous data is unreadable. */ }
  journal = { ...journal, schema: 2, events: Array.isArray(journal.events) ? journal.events.slice(-120) : [] };

  const initialSequence = journal.sequence || 0;
  let db;
  const opening = openDurableJournal();
  let queue = (opening || Promise.resolve(null)).then(async (database) => {
    db = database;
    if (!db) { durability = "unavailable"; return; }
    const saved = await readDurable(db);
    if (saved && ((saved.sequence || 0) > initialSequence || !initialSequence)) {
      const early = journal.events.filter(event => event.sequence > initialSequence);
      journal = { ...saved, events: Array.isArray(saved.events) ? saved.events : [] };
      for (const event of early) apply(event.section, event.details, event.time);
    }
  }).catch(() => { durability = "unavailable"; });

  function snapshot() {
    return { ...journal, persistence, durability };
  }

  function apply(section, details, time = now()) {
    const event = { sequence: (journal.sequence || 0) + 1, time, section, details };
    journal = { ...journal, sequence: event.sequence, updatedAt: event.time };
    if (section === "health") {
      journal.health = { samples: [...(journal.health?.samples || []), details].slice(-60) };
    } else if (section === "error") {
      journal.errors = [...(journal.errors || []), details].slice(-10);
    } else {
      journal[section] = details;
    }
    journal.events = [...journal.events, event].slice(-120);
  }
  function record(section, details) {
    apply(section, details);
    try {
      if (!storage) throw new Error("Persistent storage unavailable");
      storage.setItem(KEY, JSON.stringify(journal));
      persistence = "localStorage";
    } catch {
      persistence = "localStorage-unavailable: immediate checkpoint write failed";
    }
    queue = queue.then(async () => {
      if (db) durability = await writeDurable(db, journal);
    }).catch(() => { durability = "write-failed"; });
    return snapshot();
  }

  function flush() {
    // Diagnostics must not indefinitely block a usable camera if storage stalls.
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        durability = "pending: checkpoint commit deadline exceeded";
        resolve();
      }, 2000);
      queue.then(() => { clearTimeout(timer); resolve(); });
    });
  }
  return { record, snapshot, flush };
}
