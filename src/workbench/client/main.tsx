import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { WorkbenchApp } from "./app";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");

createRoot(root).render(
  <StrictMode>
    <WorkbenchApp />
  </StrictMode>,
);
