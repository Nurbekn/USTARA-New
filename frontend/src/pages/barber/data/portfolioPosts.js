import { request } from "../../../api/client.js";
import { getSession } from "../../auth/utils/session.js";
import { refreshBarberData } from "./store.js";

function barberSession() {
  const session = getSession();
  if (session?.role !== "barber" || !session.token) throw new Error("Sartarosh hisobi orqali qayta kiring.");
  return session;
}

async function sendMedia(file, token) {
  const result = await request("POST", "/api/media", {
    token, body: file, rawBody: true,
  });
  if (!Number.isSafeInteger(result?.id)) throw new Error("Server media faylni saqlaganini tasdiqlamadi.");
  return result;
}

export async function publishPortfolioPost({ image, videoFile, caption, service }) {
  const session = barberSession();
  const file = videoFile || await fetch(image).then((response) => response.blob());
  const media = await sendMedia(file, session.token);
  const serviceId = session.profileId
    ? (await request("GET", `/api/services?barber_id=${session.profileId}`, { token: session.token }))
      .find((item) => item.name === service)?.id ?? null
    : null;
  const result = await request("POST", "/api/social/posts", {
    token: session.token,
    body: { caption, kind: "standard", serviceId, mediaIds: [media.id] },
  });
  if (!result?.post?.id) throw new Error("Server post saqlanganini tasdiqlamadi.");
  if (!(await refreshBarberData())) throw new Error("Post saqlandi, ammo portfolio yangilanmadi.");
  return result.post;
}

export async function deletePortfolioPost(post) {
  const session = barberSession();
  const id = typeof post === "object" ? post?.id : post;
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error("Post topilmadi.");
  await request("DELETE", `/api/social/posts/${Number(id)}`, { token: session.token });
  if (!(await refreshBarberData())) throw new Error("Post o‘chirildi, ammo portfolio yangilanmadi.");
}

// #91: API is authoritative; never mutate the local list until DB confirmation.
export async function setPortfolioFeatured(post, featured) {
  const session=barberSession();
  const id=typeof post==='object'?post?.id:post;
  if(!Number.isSafeInteger(Number(id)) || Number(id)<=0 || typeof featured!=='boolean')
    throw new Error('Post yoki belgilash qiymati noto‘g‘ri.');
  const result=await request('PUT',`/api/social/posts/${Number(id)}/featured`, {
    token:session.token, body:{featured},
  });
  if(result?.postId!==Number(id) || result.featured!==featured)
    throw new Error('Server belgilangan postni tasdiqlamadi.');
  if(!(await refreshBarberData())) throw new Error('Belgi saqlandi, ammo portfolio yangilanmadi.');
  return result;
}
