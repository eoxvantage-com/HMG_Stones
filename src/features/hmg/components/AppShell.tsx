import { createContext, useContext, useEffect, useState } from "react";
import { Outlet, Link as RouterLink, useLocation } from "react-router";
import {
  Alert,
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  Link,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";
import WorkOutlineRoundedIcon from "@mui/icons-material/WorkOutlineRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ViewInArRoundedIcon from "@mui/icons-material/ViewInArRounded";
import { useLogout, useLogin } from "@refinedev/core";
import { useWorkflow, hasHmgSession } from "../api";
import type { HmgContext } from "../types";
import { LoadError, LoadingState } from "./common";
import { taruviTokens } from "../../../../themeOptions";

export const WorkspaceContext = createContext<HmgContext | undefined>(undefined);
export const useWorkspace = () => useContext(WorkspaceContext);
const SIDEBAR_PREFERENCE_KEY = "hmg.sidebar.collapsed";

export type HmgRouteCapability = "workspace" | "create" | "sales" | "quotes" | "approval" | "overview";

/** Route access comes from the server-authenticated HMG context only. */
export function HmgRouteGuard({ capability }: { capability: HmgRouteCapability }) {
  const context = useWorkspace();
  const allowed = context ? {
    workspace: Boolean(context.canCreate || context.isStaff || context.isExecutive),
    create: Boolean(context.canCreate),
    sales: Boolean(context.canSales),
    quotes: Boolean(context.canPrice),
    approval: Boolean(context.canApprove),
    overview: Boolean(context.isExecutive),
  }[capability] : false;

  if (allowed) return <Outlet />;
  return (
    <Box sx={{ maxWidth: 760, mx: "auto", p: { xs: 2, md: 4 } }}>
      <Alert severity="error" sx={{ mb: 2 }}>
        Your HMG role does not allow access to this module. Contact an HMG administrator if you need access.
      </Alert>
      <Button component={RouterLink} to="/studio" variant="contained">
        Return to Selection Studio
      </Button>
    </Box>
  );
}

function readSidebarPreference() {
  try {
    return window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
}

export function AppShell({ publicMode = false }: {publicMode?:boolean}) {
  const authenticated = hasHmgSession();
  const { mutate: login } = useLogin();
  const context = useWorkflow<HmgContext>("context", undefined, undefined, authenticated);
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarPreference);
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(sidebarCollapsed));
    } catch {
      // Navigation remains usable when browser storage is unavailable.
    }
  }, [sidebarCollapsed]);
  const { mutate: logout } = useLogout();
  const candidateProjectId =
    location.pathname.match(/\/projects\/([^/]+)/)?.[1];
  const projectId =
    candidateProjectId === "new" ? undefined : candidateProjectId;
  const links = [
    { to: "/studio", label: "Selection Studio", icon: <GridViewRoundedIcon /> },
    { to: "/studio-3d", label: "3D Stone Studio", icon: <ViewInArRoundedIcon /> },
    ...(authenticated ? [{ to: "/design-dashboard", label: "Design Dashboard", icon: <InsightsRoundedIcon /> }, { to: "/projects", label: "My projects", icon: <WorkOutlineRoundedIcon /> }] : []),
    ...(context.data?.isStaff
      ? [
          {
            to: "/sales",
            label: "Sales Workspace",
            icon: <WorkOutlineRoundedIcon />,
          },
        ]
      : []),
    ...(context.data?.canPrice
      ? [
          {
            to: "/quotes",
            label: "Quote Desk",
            icon: <DescriptionRoundedIcon />,
          },
        ]
      : []),
    ...(context.data?.isExecutive
      ? [{ to: "/overview", label: "Overview", icon: <InsightsRoundedIcon /> }]
      : []),
  ];
  const renderNav = (compact: boolean) => (
    <Stack component="nav" aria-label="Workspace" gap={1}>
      {links.map((link) => (
        <Tooltip key={link.to} title={compact ? link.label : ""} placement="right">
          <Button
            component={RouterLink}
            to={link.to}
            aria-label={link.label}
            startIcon={link.icon}
            onClick={() => setMenu(false)}
            variant={location.pathname === link.to ? "contained" : "text"}
            sx={{
              justifyContent: compact ? "center" : "flex-start",
              minWidth: compact ? 44 : undefined,
              px: compact ? 1 : undefined,
              "& .MuiButton-startIcon": { mr: compact ? 0 : undefined },
            }}
          >
            <Box component="span" sx={{ display: compact ? "none" : "inline" }}>
              {link.label}
            </Box>
          </Button>
        </Tooltip>
      ))}
    </Stack>
  );
  const nav = renderNav(sidebarCollapsed);
  return (
    <WorkspaceContext.Provider value={context.data}>
      <Link
        href="#main-content"
        sx={{
          position: "fixed",
          left: 12,
          top: -80,
          zIndex: 2000,
          p: 2,
          bgcolor: "background.paper",
          "&:focus": { top: 12 },
        }}
      >
        Skip to content
      </Link>
      <Box
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          px: { xs: 2, md: 4 },
          py: 2,
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Link
            component={RouterLink}
            to="/studio"
            underline="none"
            color="text.primary"
          >
            <Typography
              sx={{
                fontFamily: taruviTokens.font.title,
                fontSize: 26,
                letterSpacing: ".08em",
              }}
            >
              HMG{" "}
              <Box
                component="span"
                sx={{
                  fontFamily: taruviTokens.font.body,
                  fontSize: 13,
                  letterSpacing: ".24em",
                }}
              >
                STONES
              </Box>
            </Typography>
          </Link>
          <Stack direction="row" gap={1} alignItems="center">
            <Chip
              label={authenticated ? "Connected workspace" : "Public catalogue"}
              variant="outlined"
              sx={{ display: { xs: "none", sm: "flex" } }}
            />
            {authenticated ? <Button onClick={() => logout()}>Sign out</Button> : <Button onClick={() => login({redirect:true,callbackUrl:window.location.href})}>Sign in</Button>}
            <IconButton
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
              sx={{ display: { md: "none" } }}
            >
              <MenuRoundedIcon />
            </IconButton>
          </Stack>
        </Stack>
      </Box>
      <Box
        sx={{
          display: { md: "grid" },
          gridTemplateColumns: `${sidebarCollapsed ? taruviTokens.size.sidebarCollapsed : 232}px minmax(0, 1fr)`,
        }}
      >
        <Box
          component="aside"
          sx={{
            display: { xs: "none", md: "block" },
            minHeight: "calc(100vh - 125px)",
            p: sidebarCollapsed ? 1 : 2,
            borderRight: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Stack direction={sidebarCollapsed ? "column" : "row"} alignItems="center" justifyContent="space-between" sx={{ px: sidebarCollapsed ? 0 : 1, py: 1.5, mb: 1 }}>
            {!sidebarCollapsed && <Typography variant="body2" color="text.secondary">YOUR WORKSPACE</Typography>}
            <Tooltip title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} placement="right">
              <IconButton
                aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
                aria-expanded={!sidebarCollapsed}
                onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
                size="small"
              >
                {sidebarCollapsed ? <ChevronRightRoundedIcon /> : <ChevronLeftRoundedIcon />}
              </IconButton>
            </Tooltip>
          </Stack>
          {nav}
          {!sidebarCollapsed && <Box sx={{ borderTop: 1, borderColor: "divider", mt: 4, pt: 3, px: 2 }}>
            <Typography variant="body2" color="text.secondary">
              From first inspiration
              <br />
              to a considered proposal.
            </Typography>
          </Box>}
        </Box>
        <Box
          component="main"
          id="main-content"
          tabIndex={-1}
          sx={{ minWidth: 0, pb: { xs: 9, md: 0 } }}
        >
          {authenticated && !publicMode && context.loading ? (
            <Box p={4}>
              <LoadingState />
            </Box>
          ) : authenticated && context.error && !publicMode ? (
            <Box p={4}>
              <LoadError retry={() => context.refetch()} />
            </Box>
          ) : (
            <>
              <Outlet />
            </>
          )}
        </Box>
      </Box>
      <Drawer anchor="left" open={menu} onClose={() => setMenu(false)}>
        <Box sx={{ width: 280, p: 3 }}>
          <Typography variant="h3" mb={3}>
            HMG Stones
          </Typography>
          {renderNav(false)}
        </Box>
      </Drawer>
      <Stack
        component="nav"
        direction="row"
        justifyContent="space-evenly"
        sx={{
          display: { md: "none" },
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          bgcolor: "background.paper",
          borderTop: 1,
          borderColor: "divider",
          zIndex: 1200,
          py: 1,
        }}
      >
        <Button component={RouterLink} to="/studio">
          Explore
        </Button>
        <Button
          component={RouterLink}
          to={projectId ? `/projects/${projectId}` : "/projects"}
        >
          Project
        </Button>
        {projectId && (
          <>
            <Button component={RouterLink} to={`/projects/${projectId}/design`}>
              Design
            </Button>
            <Button component={RouterLink} to={`/projects/${projectId}/review`}>
              Review
            </Button>
          </>
        )}
      </Stack>
    </WorkspaceContext.Provider>
  );
}
