let connection;
export function openDatabase() {
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open("callista-teleprompter", 1);
      request.onupgradeneeded = () => {
        for (const name of ["scripts", "videos", "preferences"])
          request.result.createObjectStore(name, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        connection = undefined;
        reject(request.error);
      };
    });
  return connection;
}
export async function transact(store, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode),
      request = operation(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error || request.error);
    tx.onabort = () =>
      reject(tx.error || new Error("Storage operation interrupted."));
  });
}
export const list = (store) => transact(store, "readonly", (s) => s.getAll());
export const put = (store, item) =>
  transact(store, "readwrite", (s) => s.put(item));
export const remove = (store, id) =>
  transact(store, "readwrite", (s) => s.delete(id));
export async function storageStatus() {
  const { usage = 0, quota = 0 } =
    (await navigator.storage?.estimate?.()) || {};
  return {
    usage,
    quota,
    low:
      quota > 0 && (quota - usage < 100 * 1024 * 1024 || usage / quota > 0.9),
  };
}
export const defaults = {
  size: 32,
  speed: 32,
  opacity: 55,
  position: 5,
  alignment: "center",
  countdown: 3,
  mirror: true,
  quality: "1080",
  facing: "user",
  deviceId: "",
  tags: ["Work", "Social", "Personal"],
};
export function filterScripts(scripts, search, tag) {
  const query = search.trim().toLowerCase();
  return scripts.filter(
    (s) =>
      (!tag || s.tags.includes(tag)) &&
      `${s.title} ${s.content}`.toLowerCase().includes(query),
  );
}
