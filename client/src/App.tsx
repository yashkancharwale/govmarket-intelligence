import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import WorkspaceShell from "./components/WorkspaceShell";

const Overview = lazy(() => import("@/pages/Overview"));
const Events = lazy(() => import("@/pages/Events"));
const EventDetail = lazy(() => import("@/pages/EventDetail"));
const Ministers = lazy(() => import("@/pages/Ministers"));
const MinisterDetail = lazy(() => import("@/pages/MinisterDetail"));
const Companies = lazy(() => import("@/pages/Companies"));
const CompanyDetail = lazy(() => import("@/pages/CompanyDetail"));
const Relationships = lazy(() => import("@/pages/Relationships"));
const MarketAnalysis = lazy(() => import("@/pages/MarketAnalysis"));
const SystemHealth = lazy(() => import("@/pages/SystemHealth"));
const SavedResearch = lazy(() => import("@/pages/SavedResearch"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function Router() {
  return (
    <WorkspaceShell>
      <Suspense fallback={<div className="route-loading" role="status">Loading research view…</div>}>
        <Switch>
          <Route path="/" component={Overview} />
          <Route path="/events" component={Events} />
          <Route path="/events/:eventId" component={EventDetail} />
          <Route path="/ministers" component={Ministers} />
          <Route path="/ministers/:ministerId" component={MinisterDetail} />
          <Route path="/companies" component={Companies} />
          <Route path="/companies/:companyId" component={CompanyDetail} />
          <Route path="/relationships" component={Relationships} />
          <Route path="/market" component={MarketAnalysis} />
          <Route path="/system" component={SystemHealth} />
          <Route path="/saved" component={SavedResearch} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </WorkspaceShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
