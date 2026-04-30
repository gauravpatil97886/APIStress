import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster, ToasterProps } from "react-hot-toast";
import App from "./App";
import "./index.css";

/**
 * Responsive Toaster — top-center on mobile, top-right on desktop.
 * react-hot-toast's `position` prop is a single value, so we listen to a
 * media query and re-render the Toaster with the right position.
 */
function ResponsiveToaster() {
  const [position, setPosition] = useState<ToasterProps["position"]>(
    typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches
      ? "top-right"
      : "top-center",
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setPosition(mq.matches ? "top-right" : "top-center");
    mq.addEventListener("change", update);
    update();
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <Toaster
      position={position}
      gutter={10}
      containerStyle={{ top: 16, right: 16, left: 16 }}
      toastOptions={{
        // The default toast() / toast.success() / toast.error() helpers fall
        // back to these styles. New code should prefer `showToast.*` from
        // platform/components/ui/toast.tsx for the fully styled variants.
        duration: 3500,
        style: {
          background: "#1c1f2b",
          color: "#e7e9ee",
          border: "1px solid #252836",
          borderRadius: "12px",
          fontSize: "13px",
          maxWidth: "420px",
          lineHeight: "1.45",
          padding: "12px 14px",
          boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
        },
        success: { iconTheme: { primary: "#22c55e", secondary: "#0e0f13" }, duration: 3500 },
        error:   { iconTheme: { primary: "#ef4444", secondary: "#0e0f13" }, duration: 7000 },
      }}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <ResponsiveToaster />
    </BrowserRouter>
  </React.StrictMode>,
);
