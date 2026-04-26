import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#1c1f2b",
            color: "#e7e9ee",
            border: "1px solid #252836",
            borderRadius: "12px",
            fontSize: "13px",
            maxWidth: "440px",
            lineHeight: "1.45",
            padding: "12px 14px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
          },
          success: { iconTheme: { primary: "#22c55e", secondary: "#0e0f13" }, duration: 3500 },
          error:   { iconTheme: { primary: "#ef4444", secondary: "#0e0f13" }, duration: 7000 },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>,
);
