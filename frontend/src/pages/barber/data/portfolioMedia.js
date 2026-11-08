// Blob storage boundary: replace these operations with API calls for backend storage.
const DB_NAME = "ustara-portfolio-media";
const STORE = "videos";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("Bu brauzerda IndexedDB mavjud emas."));
      return;
    }
    let blocked = false;
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error("Video xotirasi boshqa oynada band. Boshqa Ustara oynalarini yoping va qayta urinib ko'ring.")); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function transaction(mode, operation) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = operation(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || request.error || new Error("Video xotirasi amali bekor qilindi."));
      tx.onerror = () => {}; // onabort reports errors after rollback
    });
  } finally {
    db.close();
  }
}

export const saveVideo = (id, blob) => transaction("readwrite", (store) => store.put(blob, id));
export const loadVideo = (id) => transaction("readonly", (store) => store.get(id));
export const deleteVideo = (id) => transaction("readwrite", (store) => store.delete(id));

export function mediaError(error) {
  if (error?.name === "QuotaExceededError") {
    return "Video saqlanmadi: qurilmada bo'sh joy yetarli emas. Eski postlarni o'chiring yoki kichikroq video tanlang.";
  }
  return error?.message?.includes("IndexedDB") || error?.message?.includes("boshqa oynada")
    ? error.message
    : "Video xotirasiga kirib bo'lmadi. Brauzerning saqlash ruxsatlarini va qurilmadagi bo'sh joyni tekshirib, qayta urinib ko'ring.";
}
