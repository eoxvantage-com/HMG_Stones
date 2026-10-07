import { Authenticated, Refine } from "@refinedev/core";
import { lazy, Suspense } from "react";
import {
  ErrorComponent,
  RefineSnackbarProvider,
  useNotificationProvider,
} from "@refinedev/mui";
import { CssBaseline, GlobalStyles } from "@mui/material";
import routerProvider, { DocumentTitleHandler } from "@refinedev/react-router";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import {
  taruviDataProvider,
  taruviAuthProvider,
  taruviStorageProvider,
  taruviAppProvider,
  taruviUserProvider,
  taruviAccessControlProvider,
} from "./providers/refineProviders";
import { ErrorBoundary, UnsavedChangesDialog } from "./components";
import { LoginRedirect } from "./components/auth/LoginRedirect";
import { ColorModeContextProvider } from "./contexts/color-mode";
import { AppShell, HmgRouteGuard } from "./features/hmg/components/AppShell";
import { DesignDashboard } from "./pages/hmg/design-dashboard";
import { Studio } from "./pages/hmg/studio";
import { NewProject, ProjectPage } from "./pages/hmg/projects";
import { ProjectQueue, QuoteQueue, Overview } from "./pages/hmg/queues";
import { SalesProject } from "./pages/hmg/sales";
import { Proposal, QuoteEditor, PriceApproval } from "./pages/hmg/quotes";
import { ChangeResolution } from "./features/hmg/components/ChangeResolution";
import { taruviTokens } from "../themeOptions";
import { LoadingState } from "./features/hmg/components/common";

const StoneStudio = lazy(() => import("./features/hmg/studio3d/StoneStudio").then(module => ({default:module.StoneStudio})));

const accessControl = {
  ...taruviAccessControlProvider,
  can: (params: Parameters<typeof taruviAccessControlProvider.can>[0]) =>
    taruviAccessControlProvider.can({
      ...params,
      resource: params.resource?.includes(":")
        ? params.resource
        : `datatable:${params.resource}`,
      action:
        (
          { list: "read", show: "read", edit: "update" } as Record<
            string,
            string
          >
        )[params.action] || params.action,
    }),
};
export default function App() {
  return (
    <BrowserRouter>
      <ColorModeContextProvider>
        <CssBaseline />
        <GlobalStyles
          styles={{
            body: { fontFamily: taruviTokens.font.body },
            "@page": { size: "A4 portrait", margin: "12mm" },
            "@media print": {
              'aside, nav, button, header, .MuiAppBar-root, .MuiDrawer-root, .proposal-screen-only': {
                display: "none !important",
              },
              body: { backgroundColor: "#fff" },
              main: { padding: "0 !important", width: "100% !important" },
              ".proposal-page": {
                width: "100% !important", maxWidth: "none !important",
                margin: "0 !important", padding: "0 !important",
              },
              ".proposal-print-document": {
                width: "100% !important", maxWidth: "none !important",
                margin: "0 !important", padding: "0 !important",
                border: "0 !important", borderRadius: "0 !important",
                boxShadow: "none !important", overflow: "visible !important",
              },
              ".proposal-print-table": { tableLayout: "fixed", width: "100%" },
              ".proposal-print-row": { breakInside: "avoid", pageBreakInside: "avoid" },
              ".proposal-print-section": { breakInside: "avoid", pageBreakInside: "avoid" },
            },
          }}
        />
        <RefineSnackbarProvider>
          <Refine
            dataProvider={{
              default: taruviDataProvider,
              storage: taruviStorageProvider,
              app: taruviAppProvider,
              user: taruviUserProvider,
            }}
            notificationProvider={useNotificationProvider}
            routerProvider={routerProvider}
            authProvider={taruviAuthProvider}
            accessControlProvider={accessControl}
            resources={[
              {
                name: "hmg_options",
                list: "/studio",
                meta: { label: "Selection Studio", canDelete: false },
              },
              {
                name: "hmg_revisions",
                list: "/projects",
                create: "/projects/new",
                show: "/projects/:projectId",
                edit: "/projects/:projectId",
                meta: { label: "Projects", canDelete: false },
              },
            ]}
            options={{
              syncWithLocation: true,
              warnWhenUnsavedChanges: true,
              projectId: "hmg_stones",
            }}
          >
            <Routes>
              <Route path="/login" element={<LoginRedirect />} />
              <Route
                element={
                  <Authenticated key="hmg-session" fallback={<LoginRedirect />}>
                    <ErrorBoundary>
                      <AppShell />
                    </ErrorBoundary>
                  </Authenticated>
                }
              >
                <Route element={<HmgRouteGuard capability="workspace" />}>
                  <Route index element={<Navigate to="/studio" replace />} />
                  <Route path="/studio" element={<Studio />} />
                  <Route path="/studio/options/:optionId" element={<Studio />} />
                  <Route path="/studio-3d" element={<Suspense fallback={<LoadingState />}><StoneStudio /></Suspense>} />
                  <Route path="/design-dashboard" element={<DesignDashboard />} />
                  <Route path="/projects" element={<ProjectQueue />} />
                  <Route path="/projects/:projectId" element={<ProjectPage />} />
                  <Route path="/projects/:projectId/compare" element={<ProjectPage mode="compare" />} />
                  <Route path="/projects/:projectId/design" element={<ProjectPage mode="design" />} />
                  <Route path="/projects/:projectId/review" element={<ProjectPage mode="review" />} />
                  <Route path="/projects/:projectId/changes/:changeId" element={<ChangeResolution />} />
                  <Route path="/projects/:projectId/proposals/:proposalId" element={<Proposal />} />
                </Route>
                <Route element={<HmgRouteGuard capability="create" />}>
                  <Route path="/projects/new" element={<NewProject />} />
                </Route>
                <Route element={<HmgRouteGuard capability="sales" />}>
                  <Route path="/sales" element={<ProjectQueue kind="sales" />} />
                  <Route path="/sales/projects/:projectId" element={<SalesProject />} />
                </Route>
                <Route element={<HmgRouteGuard capability="quotes" />}>
                  <Route path="/quotes" element={<QuoteQueue />} />
                  <Route path="/quotes/:quoteId" element={<QuoteEditor />} />
                </Route>
                <Route element={<HmgRouteGuard capability="approval" />}>
                  <Route path="/quotes/:quoteId/approval" element={<PriceApproval />} />
                </Route>
                <Route element={<HmgRouteGuard capability="overview" />}>
                  <Route path="/overview" element={<Overview />} />
                </Route>
                <Route path="*" element={<ErrorComponent />} />
              </Route>
            </Routes>
            <UnsavedChangesDialog />
            <DocumentTitleHandler
              handler={() => "HMG Stones - Connected workspace"}
            />
          </Refine>
        </RefineSnackbarProvider>
      </ColorModeContextProvider>
    </BrowserRouter>
  );
}
