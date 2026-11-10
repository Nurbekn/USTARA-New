// TODO: replace these local demo interactions with authenticated social APIs.
const storageKey = (viewerId, barberId) => `ustara-demo-social:${encodeURIComponent(viewerId)}:${barberId}`;

export function readDemoSocial(viewerId, barberId) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(viewerId, barberId)));
    return {
      following: saved?.following === true,
      likes: Array.isArray(saved?.likes) ? saved.likes.filter((id) => typeof id === 'string') : [],
      saved: Array.isArray(saved?.saved) ? saved.saved.filter((id) => typeof id === 'string') : [],
      comments: Array.isArray(saved?.comments) ? saved.comments.filter((item) => item && typeof item.id === 'string' && typeof item.postId === 'string' && typeof item.text === 'string') : [],
      messages: Array.isArray(saved?.messages) ? saved.messages.filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string') : [],
    };
  } catch {
    return { following: false, likes: [], saved: [], comments: [], messages: [] };
  }
}

export function saveDemoSocial(viewerId, barberId, state) {
  localStorage.setItem(storageKey(viewerId, barberId), JSON.stringify(state));
}
