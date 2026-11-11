import "../../../components/overlays.css";
import { useEffect, useRef, useState } from "react";

// const { toast, show } = useToast();
// show("Saqlandi!");   ...   {toast}
export function useToast() {
  const [message, setMessage] = useState("");
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = (text) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(""), 2600);
  };

  const toast = message ? (
    <div className="bx-toast" role="status">
      {message}
    </div>
  ) : null;

  return { toast, show };
}
