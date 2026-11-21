const pool = require("../db");

const SOCIAL_ROLES = new Set(["customer", "barber"]);
const REPORT_REASONS = new Set(["spam", "inappropriate", "misleading", "other"]);
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]);

function numericId(value) {
  const id = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function mediaMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  return null;
}

function requireAccount(req, res) {
  if (!SOCIAL_ROLES.has(req.user?.role) || !numericId(req.user?.accountId)) {
    res.status(403).json({ message: "Bu amal uchun customer yoki barber hisobi kerak." });
    return null;
  }
  return { userId: req.user.accountId, role: req.user.role, profileId: req.user.profileId };
}

async function mediaUpload(req, res) {
  const account = requireAccount(req, res);
  if (!account) return;
  const bytes = req.body;
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 100 * 1024 * 1024) {
    return res.status(400).json({ message: "Media fayli bo‘sh yoki hajmi 100 MB dan katta." });
  }
  const detected = mediaMime(bytes);
  if (!detected || !MEDIA_TYPES.has(detected) || req.get("content-type") !== "application/octet-stream") {
    return res.status(415).json({ message: "Faqat JPEG, PNG, WebP, MP4 yoki WebM fayllari qabul qilinadi." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO ustara_media(owner_user_id,content_type,content,byte_length)
       VALUES($1,$2,$3,$4) RETURNING id`,
      [account.userId, detected, bytes, bytes.length],
    );
    return res.status(201).json({ id: Number(result.rows[0].id), type: detected.startsWith("video/") ? "video" : "image" });
  } catch (error) {
    console.error("social_media_upload_failed", error.code || "internal_error");
    return res.status(500).json({ message: "Media faylini saqlab bo‘lmadi." });
  }
}

async function mediaRead(req, res) {
  const id = numericId(req.params.id);
  if (!id) return res.status(404).end();
  try {
    const result = await pool.query(
      `SELECT m.content,m.content_type
       FROM ustara_media m
       WHERE m.id=$1 AND EXISTS (
         SELECT 1 FROM social_posts p JOIN barbers b ON b.id=p.barber_id
         WHERE b.verification_status='approved' AND m.id=ANY(p.media_ids)
       )`,
      [id],
    );
    if (!result.rowCount) return res.status(404).end();
    res.set({
      "Content-Type": result.rows[0].content_type,
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    });
    return res.send(result.rows[0].content);
  } catch (error) {
    console.error("social_media_read_failed", error.code || "internal_error");
    return res.status(500).end();
  }
}

function authorFromRow(row) {
  return {
    id: row.barber_id, role: "barber", first_name: row.first_name,
    last_name: row.last_name, name: row.salon_name || undefined,
    avatarPhoto: row.avatar_url || "",
  };
}

function postFromRow(row, comments = []) {
  return {
    id: Number(row.id), author: authorFromRow(row), createdAt: row.created_at,
    caption: row.caption, kind: row.kind, featured: row.featured_at != null,
    media: row.media.map((item) => ({
      type: item.content_type.startsWith("video/") ? "video" : "image",
      url: `/api/media/${item.id}`, alt: item.alt || "",
    })),
    serviceIds: row.service_id == null ? [] : [Number(row.service_id)],
    category: row.service_name || undefined,
    likeCount: Number(row.like_count), commentCount: Number(row.comment_count),
    likedByMe: row.liked_by_me, saved: row.saved_by_me,
    comments,
  };
}

async function getPosts(rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const commentRows = await pool.query(
    `SELECT c.id,c.post_id,c.text,c.created_at,c.pinned,
            COALESCE(b.first_name,customer.first_name) AS first_name,
            COALESCE(b.last_name,customer.last_name) AS last_name,
            COALESCE(b.avatar_url,customer.avatar_url) AS avatar_url
     FROM social_comments c
     JOIN users u ON u.id=c.user_id
     LEFT JOIN barbers b ON u.role='barber' AND b.user_id=u.id
     LEFT JOIN customers customer ON u.role='customer' AND customer.user_id=u.id
     WHERE c.post_id=ANY($1::bigint[])
     ORDER BY c.pinned DESC,c.created_at DESC,c.id DESC`,
    [ids],
  );
  const grouped = new Map();
  for (const row of commentRows.rows) {
    const key = String(row.post_id);
    const comments = grouped.get(key) || [];
    if (comments.length < 30) comments.push({
      id: Number(row.id), text: row.text, createdAt: row.created_at, pinned: row.pinned === true,
      author: { first_name: row.first_name || "", last_name: row.last_name || "", avatarPhoto: row.avatar_url || "" },
    });
    grouped.set(key, comments);
  }
  return rows.map((row) => postFromRow(row, grouped.get(String(row.id)) || []));
}

async function postRows({ userId, tab = "feed", barberId = null, postId = null }) {
  const condition = postId ? "AND p.id=$3" : barberId ? "AND p.barber_id=$3" : tab === "following"
    ? "AND EXISTS(SELECT 1 FROM social_follows f WHERE f.customer_user_id=$1 AND f.barber_id=p.barber_id)"
    : tab === "saved" ? "AND EXISTS(SELECT 1 FROM social_saves s WHERE s.user_id=$1 AND s.post_id=p.id)" : "";
  const values = postId ? [userId, 1, postId] : barberId ? [userId, 100, barberId] : [userId, 100];
  const result = await pool.query(
    `SELECT p.id,p.barber_id,p.caption,p.kind,p.service_id,p.media_ids,p.created_at,p.featured_at,
            b.first_name,b.last_name,b.salon_name,b.avatar_url,s.name AS service_name,
            (SELECT count(*) FROM social_likes l WHERE l.post_id=p.id)::integer AS like_count,
            (SELECT count(*) FROM social_comments c WHERE c.post_id=p.id)::integer AS comment_count,
            EXISTS(SELECT 1 FROM social_likes l WHERE l.post_id=p.id AND l.user_id=$1) AS liked_by_me,
            EXISTS(SELECT 1 FROM social_saves sv WHERE sv.post_id=p.id AND sv.user_id=$1) AS saved_by_me,
            COALESCE((SELECT json_agg(json_build_object('id',m.id,'content_type',m.content_type) ORDER BY ord.n)
              FROM unnest(p.media_ids) WITH ORDINALITY ord(id,n)
              JOIN ustara_media m ON m.id=ord.id), '[]'::json) AS media
     FROM social_posts p JOIN barbers b ON b.id=p.barber_id
     LEFT JOIN services s ON s.id=p.service_id
     WHERE b.verification_status='approved' ${condition}
     ORDER BY ${barberId ? "p.featured_at DESC NULLS LAST," : ""}p.created_at DESC,p.id DESC LIMIT $2`, values,
  );
  return result.rows;
}

async function loadFeed(req, res) {
  const account = requireAccount(req, res);
  if (!account) return;
  const tab = ["feed", "following", "saved"].includes(req.query.tab) ? req.query.tab : "feed";
  try {
    const rows = await postRows({ userId: account.userId, tab });
    const [posts, services, following, savedPostIds, barbers] = await Promise.all([
      getPosts(rows),
      pool.query("SELECT id,name AS category FROM services ORDER BY name,id LIMIT 200"),
      pool.query("SELECT barber_id FROM social_follows WHERE customer_user_id=$1", [account.userId]),
      pool.query("SELECT post_id FROM social_saves WHERE user_id=$1", [account.userId]),
      pool.query("SELECT id,first_name,last_name FROM barbers WHERE verification_status='approved' ORDER BY created_at DESC,id DESC LIMIT 50"),
    ]);
    return res.json({
      posts, services: services.rows.map((row) => ({ ...row, id: Number(row.id) })),
      following: following.rows.map((row) => `barber:${row.barber_id}`),
      savedPostIds: savedPostIds.rows.map((row) => Number(row.post_id)),
      currentUserId: account.profileId,
      discover: { trends: [], barbers: barbers.rows.map((row) => ({ ...row, id: Number(row.id) })), salons: [] },
    });
  } catch (error) {
    console.error("social_feed_failed", error.code || "internal_error");
    return res.status(500).json({ message: "Ijtimoiy lentani yuklab bo‘lmadi." });
  }
}

async function createPost(req, res) {
  const account = requireAccount(req, res);
  if (!account) return;
  if (account.role !== "barber") return res.status(403).json({ message: "Postni faqat barber joylay oladi." });
  const { caption = "", kind = "standard", serviceId = null, mediaIds } = req.body || {};
  const text = typeof caption === "string" ? caption.trim() : null;
  const ids = Array.isArray(mediaIds) && mediaIds.every((id) => numericId(id)) ? [...new Set(mediaIds.map(Number))] : [];
  if (text === null || text.length > 2000 || !["standard", "beforeAfter"].includes(kind)
    || ids.length < 1 || ids.length > 6 || (kind === "beforeAfter" && ids.length !== 2)) {
    return res.status(400).json({ message: "Post ma’lumotlari yoki media ro‘yxati noto‘g‘ri." });
  }
  const service = serviceId == null ? null : numericId(serviceId);
  if (serviceId != null && !service) return res.status(400).json({ message: "Xizmat ID noto‘g‘ri." });
  try {
    const owned = await pool.query(
      `SELECT count(*)::integer AS count FROM ustara_media
       WHERE id=ANY($1::bigint[]) AND owner_user_id=$2`, [ids, account.userId],
    );
    if (owned.rows[0].count !== ids.length) return res.status(400).json({ message: "Media fayllardan biri sizga tegishli emas." });
    if (service) {
      const ownedService = await pool.query("SELECT 1 FROM services WHERE id=$1 AND barber_id=$2", [service, account.profileId]);
      if (!ownedService.rowCount) return res.status(400).json({ message: "Tanlangan xizmat barber profilingizga tegishli emas." });
    }
    const result = await pool.query(
      `INSERT INTO social_posts(barber_id,caption,kind,service_id,media_ids)
       SELECT b.id,$1,$2,$3,$4::bigint[] FROM barbers b WHERE b.id=$5 AND b.user_id=$6
       RETURNING id`,
      [text, kind, service, ids, account.profileId, account.userId],
    );
    if (!result.rowCount) return res.status(403).json({ message: "Barber profilingiz tasdiqlanmadi." });
    const rows = await postRows({ userId: account.userId, barberId: account.profileId });
    const created = rows.find((row) => Number(row.id) === Number(result.rows[0].id));
    return res.status(201).json({ post: postFromRow(created) });
  } catch (error) {
    console.error("social_post_create_failed", error.code || "internal_error");
    return res.status(500).json({ message: "Postni saqlab bo‘lmadi." });
  }
}

async function deletePost(req, res) {
  const account = requireAccount(req, res);
  if (!account) return;
  const id = numericId(req.params.id);
  if (!id) return res.status(404).json({ message: "Post topilmadi." });
  try {
    const result = await pool.query(
      `DELETE FROM social_posts p USING barbers b
       WHERE p.id=$1 AND p.barber_id=b.id AND b.user_id=$2 RETURNING p.id`, [id, account.userId],
    );
    return result.rowCount ? res.json({ deleted: true }) : res.status(404).json({ message: "Post topilmadi." });
  } catch (error) {
    console.error("social_post_delete_failed", error.code || "internal_error");
    return res.status(500).json({ message: "Postni o‘chirib bo‘lmadi." });
  }
}

async function getPost(req, res) {
  const account = requireAccount(req, res);
  if (!account) return;
  const id = numericId(req.params.id);
  if (!id) return res.status(404).json({ message: "Post topilmadi." });
  try {
    const rows = await postRows({ userId: account.userId, postId: id });
    const [post] = await getPosts(rows);
    if (!post) return res.status(404).json({ message: "Post topilmadi." });
    res.set("Cache-Control", "no-store");
    return res.json({ post });
  } catch { return res.status(503).json({ message: "Postni yuklab bo‘lmadi." }); }
}

async function comments(req, res) {
  const account = requireAccount(req, res);
  if (!account) return;
  const id = numericId(req.params.id);
  if (!id) return res.status(404).json({ message: "Post topilmadi." });
  try {
    const result = await pool.query(
      `SELECT c.id,c.text,c.created_at,c.pinned,(c.user_id=$2) AS mine,
              COALESCE(b.first_name,customer.first_name) AS first_name,
              COALESCE(b.last_name,customer.last_name) AS last_name,
              COALESCE(b.avatar_url,customer.avatar_url) AS avatar_url
       FROM social_comments c JOIN social_posts p ON p.id=c.post_id JOIN barbers owner ON owner.id=p.barber_id
       JOIN users u ON u.id=c.user_id LEFT JOIN barbers b ON u.role='barber' AND b.user_id=u.id
       LEFT JOIN customers customer ON u.role='customer' AND customer.user_id=u.id
       WHERE c.post_id=$1 AND owner.verification_status='approved' ORDER BY c.pinned DESC,c.created_at DESC,c.id DESC LIMIT 100`, [id, account.userId],
    );
    return res.json(result.rows.map((row) => ({ id: Number(row.id), text: row.text, mine: row.mine, pinned: row.pinned === true, createdAt: row.created_at,
      author: { first_name: row.first_name || "", last_name: row.last_name || "", avatarPhoto: row.avatar_url || "" } })));
  } catch (error) {
    console.error("social_comments_read_failed", error.code || "internal_error");
    return res.status(500).json({ message: "Izohlarni yuklab bo‘lmadi." });
  }
}

async function addComment(req, res) {
  const account = requireAccount(req, res);
  if (!account) return;
  const id = numericId(req.params.id);
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!id) return res.status(404).json({ message: "Post topilmadi." });
  if (!text || text.length > 500) return res.status(400).json({ message: "Izoh 1 dan 500 belgigacha bo‘lishi kerak." });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    const post = await client.query("SELECT p.id FROM social_posts p JOIN barbers b ON b.id=p.barber_id WHERE p.id=$1 AND b.verification_status='approved' FOR UPDATE OF p FOR SHARE OF b", [id]);
    if (!post.rowCount) { await client.query("ROLLBACK");return res.status(404).json({ message: "Post topilmadi." }); }
    // #82: one post row lock serializes per-post comment frequency checks.
    // DB clock enforces limits without trusting client timestamps or UI state.
    const moderation = await client.query(
      `SELECT count(*) FILTER (WHERE created_at >= now() - INTERVAL '1 minute')::integer AS recent_total,
              count(*) FILTER (WHERE post_id=$1 AND created_at >= now() - INTERVAL '1 minute')::integer AS recent_post,
              COALESCE(bool_or(post_id=$1 AND text=$3), FALSE) AS repeated
       FROM social_comments
       WHERE user_id=$2 AND created_at >= now() - INTERVAL '10 minutes'`, [id, account.userId, text]);
    const stats = moderation.rows[0];
    if (!stats || Number(stats.recent_total) >= 10 || Number(stats.recent_post) >= 5 || stats.repeated === true) {
      await client.query('ROLLBACK');
      return res.status(429).json({message:'Izohlar juda tez yoki takror yuborildi. Keyinroq urinib ko‘ring.'});
    }
    const inserted = await client.query('INSERT INTO social_comments(post_id,user_id,text) VALUES($1,$2,$3) RETURNING id,text,created_at', [id, account.userId, text]);
    const identity = await client.query(`SELECT COALESCE(b.first_name,c.first_name) first_name,COALESCE(b.last_name,c.last_name) last_name,COALESCE(b.avatar_url,c.avatar_url) avatar_url
      FROM users u LEFT JOIN barbers b ON u.role='barber' AND b.user_id=u.id LEFT JOIN customers c ON u.role='customer' AND c.user_id=u.id WHERE u.id=$1`, [account.userId]);
    const count = await client.query('SELECT count(*)::int AS count FROM social_comments WHERE post_id=$1', [id]);
    await client.query('COMMIT');
    const row = inserted.rows[0];
    return res.status(201).json({ id: Number(row.id), mine: true, pinned: false, text: row.text, createdAt: row.created_at, commentCount: count.rows[0].count,
      author: { first_name: identity.rows[0]?.first_name || "", last_name: identity.rows[0]?.last_name || "", avatarPhoto: identity.rows[0]?.avatar_url || "" } });
  } catch {
    if (client) { try { await client.query('ROLLBACK'); } catch { /* Ulanish baribir yopiladi. */ } }
    return res.status(503).json({ message: "Izohni saqlab bo‘lmadi." });
  } finally { client?.release(); }
}


async function changeComment(req, res) {
  const account = requireAccount(req, res);
  if (!account) return;
  const postId = numericId(req.params.id), id = numericId(req.params.commentId);
  const removing = req.method === 'DELETE';
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!postId || !id) return res.status(404).json({ message: 'Izoh topilmadi.' });
  if (!removing && (!text || text.length > 500)) return res.status(400).json({ message: 'Izoh 1 dan 500 belgigacha bo‘lsin.' });
  let client;
  try {
    client = await pool.connect(); await client.query('BEGIN'); await client.query("SET LOCAL lock_timeout='5s'");
    const post = await client.query("SELECT p.id FROM social_posts p JOIN barbers b ON b.id=p.barber_id WHERE p.id=$1 AND b.verification_status='approved' FOR UPDATE OF p FOR SHARE OF b", [postId]);
    if (!post.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Post topilmadi.' }); }
    const result = removing
      ? await client.query('DELETE FROM social_comments WHERE id=$1 AND post_id=$2 AND user_id=$3 RETURNING id', [id, postId, account.userId])
      : await client.query('UPDATE social_comments SET text=$4 WHERE id=$1 AND post_id=$2 AND user_id=$3 RETURNING id,text', [id, postId, account.userId, text]);
    if (!result.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Izoh topilmadi.' }); }
    const count = await client.query('SELECT count(*)::int AS count FROM social_comments WHERE post_id=$1', [postId]);
    await client.query('COMMIT'); return res.json({ id, ...(removing ? { deleted: true } : { text }), commentCount: count.rows[0].count });
  } catch { if (client) { try { await client.query('ROLLBACK'); } catch { /* Ulanish yopiladi. */ } } return res.status(503).json({ message: 'Izohni yangilab bo‘lmadi.' }); }
  finally { client?.release(); }
}

async function setMembership(req, res, table, desired) {
  const account = requireAccount(req, res);
  if (!account) return;
  const postId = numericId(req.params.id);
  if (!postId || typeof desired !== "boolean" || !['social_likes','social_saves'].includes(table)) return res.status(400).json({ message: "So‘rov ma’lumotlari noto‘g‘ri." });
  let client;
  try {
    client = await pool.connect();await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    const post = await client.query("SELECT p.id FROM social_posts p JOIN barbers b ON b.id=p.barber_id WHERE p.id=$1 AND b.verification_status='approved' FOR SHARE OF p,b", [postId]);
    if (!post.rowCount) { await client.query('ROLLBACK');return res.status(404).json({ message: "Post topilmadi." }); }
    if (desired) await client.query(`INSERT INTO ${table}(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [postId, account.userId]);
    else await client.query(`DELETE FROM ${table} WHERE post_id=$1 AND user_id=$2`, [postId, account.userId]);
    const result = await client.query(`SELECT (SELECT count(*)::int FROM social_likes WHERE post_id=$1) AS "likeCount",
      EXISTS(SELECT 1 FROM social_likes WHERE post_id=$1 AND user_id=$2) AS liked,
      EXISTS(SELECT 1 FROM social_saves WHERE post_id=$1 AND user_id=$2) AS saved`, [postId, account.userId]);
    await client.query('COMMIT');res.set('Cache-Control','no-store');
    return res.json({ postId, ...result.rows[0] });
  } catch {
    if (client) { try { await client.query('ROLLBACK'); } catch { /* Ulanish baribir yopiladi. */ } }
    return res.status(503).json({ message: "Amalni saqlab bo‘lmadi." });
  } finally { client?.release(); }
}

async function like(req, res) { return setMembership(req, res, "social_likes", req.body?.liked); }
async function save(req, res) { return setMembership(req, res, "social_saves", req.body?.saved); }

async function follow(req, res) {
  const account = requireAccount(req, res);
  if (!account) return;
  if (account.role !== "customer") return res.status(403).json({ message: "Ustani faqat customer kuzata oladi." });
  const barberId = numericId(req.params.barberId);
  const desired = req.body?.following;
  if (!barberId || typeof desired !== "boolean") return res.status(400).json({ message: "So‘rov ma’lumotlari noto‘g‘ri." });
  try {
    if (desired) await pool.query(
      `INSERT INTO social_follows(customer_user_id,barber_id)
       SELECT $1,b.id FROM barbers b WHERE b.id=$2 AND b.verification_status='approved' ON CONFLICT DO NOTHING`, [account.userId, barberId],
    );
    else await pool.query("DELETE FROM social_follows WHERE customer_user_id=$1 AND barber_id=$2", [account.userId, barberId]);
    return res.json({ barberId, following: desired });
  } catch (error) {
    console.error("social_follow_failed", error.code || "internal_error");
    return res.status(500).json({ message: "Obuna holatini saqlab bo‘lmadi." });
  }
}

async function report(req, res) {
  const account = requireAccount(req, res);
  if (!account) return;
  const postId = numericId(req.params.id);
  const { reason, text = "" } = req.body || {};
  if (!postId || !REPORT_REASONS.has(reason) || typeof text !== "string" || text.length > 500) {
    return res.status(400).json({ message: "Shikoyat ma’lumotlari noto‘g‘ri." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO social_reports(post_id,user_id,reason,details)
       SELECT p.id,$2,$3,NULLIF($4,'') FROM social_posts p JOIN barbers b ON b.id=p.barber_id
       WHERE p.id=$1 AND b.verification_status='approved' ON CONFLICT(post_id,user_id) DO NOTHING RETURNING id`,
      [postId, account.userId, reason, text.trim()],
    );
    if (!result.rowCount) {
      const exists = await pool.query("SELECT 1 FROM social_posts WHERE id=$1", [postId]);
      if (!exists.rowCount) return res.status(404).json({ message: "Post topilmadi." });
      return res.status(409).json({ message: "Bu post haqida avval shikoyat yuborilgansiz." });
    }
    return res.status(201).json({ accepted: true });
  } catch (error) {
    console.error("social_report_failed", error.code || "internal_error");
    return res.status(500).json({ message: "Shikoyatni saqlab bo‘lmadi." });
  }
}

async function getPortfolio(req, res) {
  // The public portfolio is readable without an account. "me" is never public:
  // it must resolve to the currently authenticated barber, not an arbitrary ID.
  const account = req.params.id === "me" ? requireAccount(req, res) : null;
  if (req.params.id === "me" && !account) return;
  const barberId = req.params.id === "me" ? (account.role === "barber" ? numericId(account.profileId) : null) : numericId(req.params.id);
  if (!barberId) return res.status(404).json({ message: "Barber topilmadi." });
  const userId = req.params.id === "me" ? account.userId : (numericId(req.user?.accountId) || null);
  try {
    const rows = await postRows({ userId, barberId });
    if (!rows.length && req.params.id !== "me") {
      const exists = await pool.query("SELECT 1 FROM barbers WHERE id=$1 AND verification_status='approved'", [barberId]);
      if (!exists.rowCount) return res.status(404).json({ message: "Tasdiqlangan barber topilmadi." });
    }
    const counts = await pool.query(`SELECT
      (SELECT count(*)::int FROM social_follows WHERE barber_id=$1) AS followers,
      (SELECT count(*)::int FROM social_follows WHERE customer_user_id=$2) AS following`, [barberId, userId]);
    return res.json({ posts: await getPosts(rows), followerCount: counts.rows[0].followers, followingCount: counts.rows[0].following });
  } catch (error) {
    console.error("barber_portfolio_failed", error.code || "internal_error");
    return res.status(500).json({ message: "Portfolio ma’lumotlarini yuklab bo‘lmadi." });
  }
}

async function createReport(req, res) { return report(req, res); }

module.exports = {
  mediaUpload, mediaRead, loadFeed, createPost, deletePost, getPost, comments, addComment, changeComment,
  like, save, follow, report: createReport, getPortfolio,
};
