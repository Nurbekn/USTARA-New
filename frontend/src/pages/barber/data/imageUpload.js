// Mobile galleries may omit MIME types or return HEIC/HEIF camera photos.
export const isImageFile = (file) => file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp)$/i.test(file.name);
export const isVideoFile = (file) => file.type.startsWith("video/") || /\.(mp4|m4v|mov|webm)$/i.test(file.name);

export async function prepareImage(file, { square = false, maxSide = 900 } = {}) {
  if (!isImageFile(file)) throw new Error("Galereyadan rasm tanlang.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Rasm 25 MB dan oshmasin.");
  // Read the selected file before resetting the picker. This also handles
  // gallery/cloud files without relying on a temporary blob URL for decoding.
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Rasmni telefondan o'qib bo'lmadi. Uni galereyaga saqlab, qayta tanlang."));
    reader.onabort = () => reject(new Error("Rasmni o'qish to'xtadi. Qayta tanlang."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bu rasm formatini brauzer o'qiy olmadi. JPG yoki PNG nusxasini tanlang."));
    img.src = source;
  });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error("Rasmni o'qib bo'lmadi. Boshqa rasm tanlang.");
    const side = Math.min(width, height);
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = square ? Math.min(side, maxSide) : Math.max(1, Math.round(width * scale));
    canvas.height = square ? canvas.width : Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Rasmni tayyorlab bo'lmadi. Qayta urinib ko'ring.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, square ? (width - side) / 2 : 0, square ? (height - side) / 2 : 0, square ? side : width, square ? side : height, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/jpeg", 0.8);
    if (!result.startsWith("data:image/jpeg")) throw new Error("Rasm tayyorlanmadi. Kichikroq rasm tanlang.");
    return result;
}
