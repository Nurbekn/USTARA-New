
import "./Loading.css";

function Loading({ text = "Yuklanmoqda..." }) {
  return (
    <div className="loading-container" role="status" aria-live="polite">
      <span className="loading-spinner" />
      <p>{text}</p>
    </div>
  );
}

export default Loading;
