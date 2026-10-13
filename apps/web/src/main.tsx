import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initI18n } from "./i18n";
import { initTheme } from "./theme";
import "./styles.css";

// Colours first: the cached theme is applied before anything renders.
initTheme();

// Load the interface language before any screen module runs (their texts are translated at load).
void initI18n().then(async () => {
  const { App } = await import("./App");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
