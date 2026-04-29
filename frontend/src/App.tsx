import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/ui/AppShell";
import { getKey } from "./lib/api";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import TestBuilder from "./pages/TestBuilder";
import Runs from "./pages/Runs";
import LiveRun from "./pages/LiveRun";
import Reports from "./pages/Reports";
import ReportDetail from "./pages/ReportDetail";
import History from "./pages/History";
import Compare from "./pages/Compare";
import Overview from "./pages/Overview";
import ModePicker from "./pages/ModePicker";
import PostWomen from "./pages/postwomen/PostWomen";
import SavedTests from "./pages/SavedTests";
import Environments from "./pages/Environments";

function Protected({ children }: { children: JSX.Element }) {
  return getKey() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Mode picker — full-screen, no AppShell */}
      <Route path="/mode" element={<Protected><ModePicker /></Protected>} />
      {/* PostWomen — its own full-screen 3-pane shell, no AppShell */}
      <Route path="/postwomen" element={<Protected><PostWomen /></Protected>} />

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
