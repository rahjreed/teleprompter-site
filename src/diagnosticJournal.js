// Bounded recording evidence. Storage v3 isolates this journal from older previews.
const KEY = "prompterson-capture-journal-v3";
const PREVIOUS_KEY = "prompterson-capture-journal-v2";
const ENABLED = "prompterson-capture-diagnostics-enabled";
const META = new Set(["schema", "events", "health", "errors", "sequence", "updatedAt", "sectionClocks"]);

function browserStorage(name) {
  try { return globalThis[name]; } catch { return null; }
}

export function diagnosticsRequested(search, storage = browserStorage("localStorage")) {
  const choice = new URLSearchParams(search).get("recordingDiagnostics");
  try {
    if (choice === "1") storage?.setItem(ENABLED, "1");
    if (choice === "0") storage?.removeItem(ENABLED);
    return choice === "1" || (choice !== "0" && storage?.getItem(ENABLED) === "1");
  } catch { return choice === "1"; }
}

function compare(a, b) {
  return String(a.time || "").localeCompare(String(b.time || "")) ||
    (a.sequence || 0) - (b.sequence || 0) || String(a.id || "").localeCompare(String(b.id || ""));
}

function unique(values, limit) {
  return [...new Map(values.map(value => [value.id, value])).values()].sort(compare).slice(-limit);
}

function normalize(value = {}) {
  const journal = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const clocks = { ...journal.sectionClocks };
  for (const section of Object.keys(journal)) {
    if (!META.has(section) && !clocks[section]) clocks[section] = { time: journal.updatedAt || "", sequence: 0 };
  }
  const events = (Array.isArray(journal.events) ? journal.events : []).map(event => ({
    ...event, id: event.id || `legacy:${event.time}:${event.sequence}:${event.section}`,
  }));
  const samples = (journal.health?.samples || []).map((sample, index) => ({
    ...sample, id: sample.id || `legacy-health:${journal.updatedAt}:${index}`,
  }));
  return { ...journal, schema: 3, sectionClocks: clocks, events, health: { samples } };
}

export function mergeDiagnosticJournals(first, second) {
  const a = normalize(first), b = normalize(second);
  const merged = { ...a, ...b, sectionClocks: { ...a.sectionClocks, ...b.sectionClocks } };
  for (const section of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (META.has(section)) continue;
    if (!(section in b) || (section in a && compare(a.sectionClocks[section], b.sectionClocks[section]) > 0)) {
      merged[section] = a[section];
      merged.sectionClocks[section] = a.sectionClocks[section];
    }
  }
  merged.events = unique([...a.events, ...b.events], 120);
  merged.health = { samples: unique([...a.health.samples, ...b.health.samples], 60) };
  merged.errors = merged.events.filter(event => event.section === "error").slice(-10).map(event => event.details);
  merged.sequence = Math.max(a.sequence || 0, b.sequence || 0);
  merged.updatedAt = [a.updatedAt || "", b.updatedAt || ""].sort().at(-1);
  return merged;
}

function openDurableJournal() {
  if (!globalThis.indexedDB) return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("prompterson-capture-diagnostics", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("snapshots");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

function readDurable(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("snapshots", "readonly");
    const current = tx.objectStore("snapshots").get("journal-v3");
    const previous = tx.objectStore("snapshots").get("journal");
    tx.oncomplete = () => resolve(current.result || previous.result);
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}

function writeDurable(db, value) {
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction("snapshots", "readwrite", { durability: "strict" }); }
    catch { tx = db.transaction("snapshots", "readwrite"); }
    const store = tx.objectStore("snapshots");
    const read = store.get("journal-v3");
    let merged;
    read.onsuccess = () => {
      merged = mergeDiagnosticJournals(read.result, value);
      store.put(merged, "journal-v3");
    };
    tx.oncomplete = () => resolve({ journal: merged, durability: tx.durability === "strict" ? "strict" : "browser-default" });
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}

export function createDiagnosticJournal({
  storage = browserStorage("localStorage"),
  legacyStorage = browserStorage("sessionStorage"),
  now = () => new Date().toISOString(),
} = {}) {
  const readLocal = () => {
    try { return JSON.parse(storage?.getItem(KEY) ?? storage?.getItem(PREVIOUS_KEY) ?? legacyStorage?.getItem("prompterson-capture-audit") ?? "{}"); }
    catch { return {}; }
  };
  const writerId = crypto.randomUUID();
  let journal = normalize(readLocal());
  let persistence = "memory-only", durability = "pending", db;
  let queue = (openDurableJournal() || Promise.resolve(null)).then(async database => {
    db = database;
    if (!db) { durability = "unavailable"; return; }
    journal = mergeDiagnosticJournals(await readDurable(db), journal);
  }).catch(() => { durability = "unavailable"; });

  const snapshot = () => ({ ...journal, persistence, durability });
  function record(section, details) {
    // Merge immediately as well as transactionally so an idle tab cannot erase capture evidence.
    journal = mergeDiagnosticJournals(readLocal(), journal);
    const event = { id: crypto.randomUUID(), writerId, sequence: journal.sequence + 1, time: now(), section, details };
    journal = { ...journal, sequence: event.sequence, updatedAt: event.time,
      sectionClocks: { ...journal.sectionClocks, [section]: { time: event.time, sequence: event.sequence, id: event.id } } };
    if (section === "health") {
      journal.health = { samples: unique([...journal.health.samples, { ...details, writerId, id: event.id, time: event.time, sequence: event.sequence }], 60) };
    } else if (section !== "error") journal[section] = details;
    journal.events = unique([...journal.events, event], 120);
    journal.errors = journal.events.filter(e => e.section === "error").slice(-10).map(e => e.details);
    try {
      if (!storage) throw Error("Unavailable");
      storage.setItem(KEY, JSON.stringify(journal));
      persistence = "localStorage";
    } catch { persistence = "localStorage-unavailable: immediate checkpoint write failed"; }
    queue = queue.then(async () => {
      if (db) {
        const saved = await writeDurable(db, journal);
        durability = saved.durability;
        journal = mergeDiagnosticJournals(saved.journal, journal);
      }
    }).catch(() => { durability = "write-failed"; });
    return snapshot();
  }

  function flush() {
    const completed = queue.then(async () => {
      if (db) journal = mergeDiagnosticJournals(await readDurable(db), journal);
      else journal = mergeDiagnosticJournals(readLocal(), journal);
    }).catch(() => { durability = "read-failed"; });
    return new Promise(resolve => {
      const timer = setTimeout(() => { durability = "pending: checkpoint commit deadline exceeded"; resolve(); }, 2000);
      completed.then(() => { clearTimeout(timer); resolve(); });
    });
  }
  return { record, snapshot, flush };
}

// The exporting runtime is authoritative. Recovered older journal fields must not
// impersonate the build that generated the new file.
export function createDiagnosticsExport(evidence, currentBuild, browser) {
  return { ...evidence, browser, build: currentBuild, exportedBy: currentBuild };
}
