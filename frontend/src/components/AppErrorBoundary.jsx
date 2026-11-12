import { Component } from "react";

export default class AppErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="app-loading app-loading--screen" role="alert">
          <p>Sahifani ochib bo‘lmadi</p>
          <small>Internet aloqasini tekshirib, qayta urinib ko‘ring.</small>
          <button type="button" onClick={() => window.location.reload()}>Qayta yuklash</button>
        </div>
      );
    }
    return this.props.children;
  }
}
