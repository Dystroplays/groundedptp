import React, { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { DemoProvider, LiveProvider, PresentationProvider } from "./store";
import { Presentation } from "./proposal-ui";
import { App, Login, ReferralForm } from "./ui";
import "@fontsource/sora/latin-400.css";
import "@fontsource/sora/latin-600.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "./styles.css";
import "./details.css";
import "./proposal.css";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="standalone">
        <h1>Let’s reconnect.</h1>
        <p>Your portal could not load. Try refreshing, or sign in again.</p>
        <button onClick={() => window.location.assign("/login")}>
          Return to sign in
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
function LiveGate() {
  const location=useLocation();
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (location.pathname.startsWith("/r/")) return <ReferralForm />;
  if(location.pathname==='/login')return <Login/>;
  if (isLoading)
    return (
      <main className="standalone" role="status">
        Opening your portal…
      </main>
    );
  const presentation = location.pathname.match(/^\/team\/patients\/([^/]+)\/present$/);
  if (isAuthenticated && presentation) return <PresentationProvider patientId={presentation[1]}><Routes><Route path="/team/patients/:id/present" element={<Presentation />} /></Routes></PresentationProvider>;
  return isAuthenticated ? (
    <LiveProvider>
      <App />
    </LiveProvider>
  ) : (
    <Login />
  );
}
const url = import.meta.env.VITE_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        {client ? (
          <ConvexAuthProvider client={client} shouldHandleCode={false}>
            <LiveGate />
          </ConvexAuthProvider>
        ) : (
          <DemoProvider>
            <App />
          </DemoProvider>
        )}
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
