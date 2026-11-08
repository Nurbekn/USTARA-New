// Keep profile photos small enough for the existing localStorage profile store.
export function prepareProfilePhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return Promise.reject(new Error("JPG, PNG yoki WEBP rasm tanlang."));
  }
  if (file.size > 15 * 1024 * 1024) {
    return Promise.reject(new Error("Rasm 15 MB dan oshmasin."));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        if (!side) throw new Error();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 384;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 384, 384);
        ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 384, 384);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        reject(new Error("Rasmni tayyorlab bo'lmadi. Boshqa rasm tanlang."));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Rasmni o'qib bo'lmadi. Boshqa rasm tanlang."));
    };
    image.src = url;
  });
}
