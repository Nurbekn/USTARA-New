// Coordinates post metadata and media; UI stays independent of persistence details.
import { addPost, removePost } from "./store.js";
import { saveVideo, loadVideo, deleteVideo } from "./portfolioMedia.js";

export async function publishPortfolioPost({ image, videoFile, caption, service }) {
  let videoId;
  if (videoFile) {
    videoId = crypto.randomUUID();
    await saveVideo(videoId, videoFile);
  }
  const media = videoId ? { mediaType: "video", videoId } : { mediaType: "image", image };
  if (!addPost({ ...media, caption, service })) {
    if (videoId) {
      try {
        await deleteVideo(videoId);
      } catch {
        throw new Error("Post saqlanmadi. Video faylini tozalash ham bajarilmadi. Brauzer xotirasini tekshiring va qayta urinib ko'ring.");
      }
    }
    throw new Error("Post saqlanmadi. localStorage to'lgan yoki saqlash bloklangan. Eski postlarni o'chiring va qayta urinib ko'ring.");
  }
}

export async function deletePortfolioPost(post) {
  const blob = post.videoId ? await loadVideo(post.videoId) : null;
  if (post.videoId) await deleteVideo(post.videoId);
  if (!removePost(post.id)) {
    if (blob) {
      try {
        await saveVideo(post.videoId, blob);
      } catch {
        throw new Error("Post ma'lumotlari o'chirilmadi, lekin video faylini tiklab bo'lmadi. Brauzer xotirasini tekshiring.");
      }
    }
    throw new Error("Post o'chirilmadi. Brauzer xotirasiga yozib bo'lmadi. Qayta urinib ko'ring.");
  }
}
