import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./platform/components/layout/AppShell";
import { getKey } from "./platform/api/client";

import Login from "./platform/pages/Login";
import ModePicker from "./platform/pages/ModePicker";
import Admin from "./platform/pages/Admin";

import Dashboard from "./tools/apistress/pages/Dashboard";
import TestBuilder from "./tools/apistress/pages/TestBuilder";
import Runs from "./tools/apistress/pages/Runs";
import LiveRun from "./tools/apistress/pages/LiveRun";
import Reports from "./tools/apistress/pages/Reports";
import ReportDetail from "./tools/apistress/pages/ReportDetail";
import History from "./tools/apistress/pages/History";
import Compare from "./tools/apistress/pages/Compare";
import Overview from "./tools/apistress/pages/Overview";
import SavedTests from "./tools/apistress/pages/SavedTests";
import Environments from "./tools/apistress/pages/Environments";
import { TOOLS } from "./tools/registry";

function Protected({ children }: { children: JSX.Element }) {
  return getKey() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Admin console — public route (has its own passphrase gate inside) */}
      <Route path="/admin" element={<Admin />} />
      {/* Mode picker — full-screen, no AppShell */}
      <Route path="/mode" element={<Protected><ModePicker /></Protected>} />
      {/* Standalone tools (PostWomen, Crosswalk, …) — registry-driven so
          adding a new tool = one entry in tools/registry.tsx. */}
      {TOOLS.filter(t => t.shell === "standalone" && t.Page).map(t => {
        const Page = t.Page!;
        return <Route key={t.slug} path={t.routePath} element={<Protected><Page /></Protected>} />;
      })}

      <Route element={<Protected><AppShell /></Protected>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/builder" element={<TestBuilder />} />
        <Route path="/tests" element={<SavedTests />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/history" element={<History />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/runs" element={<Runs />} />
        <Route path="/runs/:id" element={<LiveRun />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/:id" element={<ReportDetail />} />
        <Route path="/environments" element={<Environments />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
