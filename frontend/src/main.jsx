import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/geist";
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";
import { DEMO } from "./api";
import DemoGate from "./demo/DemoGate";
import { ThemeProvider } from "./theme";
import "./styles.css";

// The demo is hosted on a static site, so it uses #/routes that survive a refresh.
const Router = DEMO ? HashRouter : BrowserRouter;
const app = <Router><App /></Router>;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>{DEMO ? <DemoGate>{app}</DemoGate> : app}</ThemeProvider>
  </React.StrictMode>
);
