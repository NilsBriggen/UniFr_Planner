import { Component, type ReactNode } from "react";
import type { Language } from "./i18n";
import { experienceMessages } from "./experience-messages";
import { Button } from "./components";

export default class RouteBoundary extends Component<
  { children: ReactNode; language: Language },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const t = experienceMessages[this.props.language];
    return (
      <div className="page" role="alert">
        <p>{t.loadFailed}</p>
        <Button onClick={() => window.location.reload()}>{t.reload}</Button>
      </div>
    );
  }
}
