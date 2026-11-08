import { useId, useState } from "react";

const EMOJIS = ["❤️", "🔥", "😍", "👏", "💯", "✨", "✂️", "💈", "👍", "😊", "🙌", "😎", "🤍", "👌", "🎉", "💪"];
export default function EmojiPicker({ onSelect, disabled = false }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="bx-emoji-picker">
    <button type="button" className="bx-social-button" aria-label="Emoji qo'shish" aria-expanded={open} aria-controls={id} disabled={disabled} onClick={() => setOpen(!open)}>☺</button>
    {open && <div id={id} className="bx-emoji-list" role="group" aria-label="Emojilar">
      {EMOJIS.map((emoji) => <button key={emoji} type="button" disabled={disabled} aria-label={emoji} onClick={() => onSelect(emoji)}>{emoji}</button>)}
    </div>}
  </div>;
}
