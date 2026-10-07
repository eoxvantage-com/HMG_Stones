import { ReactNode, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import ImageNotSupportedRoundedIcon from "@mui/icons-material/ImageNotSupportedRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { taruviTokens } from "../../../../themeOptions";
import type { HmgProject } from "../types";

export const DEMO_LABEL = "HMG Stones";
export function ConflictRecovery({
  version,
  refresh,
  onRebase,
  extraContent,
  container,
}: {
  version?: number;
  refresh: () => Promise<HmgProject>;
  onRebase: (version: number) => void;
  extraContent?: ReactNode;
  container?: HTMLElement | null;
}) {
  const [snapshot, setSnapshot] = useState<HmgProject>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (version === undefined) return null;
  return (
    <Box sx={{ mb: 2 }}>
      <Button
        variant="outlined"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setSnapshot(await refresh());
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Latest revision unavailable"
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Review conflict and retain my edits
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
      <Dialog
        container={container}
        open={!!snapshot}
        onClose={() => setSnapshot(undefined)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          Review saved revision {snapshot?.version} before reapplying?
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Your unsaved editor is retained. Compare it with the latest saved
            information below. This action only changes the base revision for
            your next explicit Save; it does not save or overwrite anything now.
          </Alert>
          {snapshot && (
            <Stack spacing={2}>
              {extraContent}
              <Typography variant="h3">{snapshot.name}</Typography>
              <Typography>
                Selection v{snapshot.selectionVersion} · {snapshot.stage} ·
                Preferred option: {snapshot.preferredOptionId || "None"}
              </Typography>
              <Typography>
                {snapshot.brief.room} · {snapshot.brief.application} ·{" "}
                {snapshot.brief.quantity || "Unknown quantity"}{" "}
                {snapshot.brief.unit}
              </Typography>
              <Typography>
                Priorities: {snapshot.brief.priorities.join(" / ") || "None"} ·
                Requirements: {snapshot.brief.requirements || "None"}
              </Typography>
              <Typography>
                Questions:{" "}
                {snapshot.questions
                  .map((q) => `${q.text} (${q.status})`)
                  .join("; ") || "None"}
              </Typography>
              <Typography>
                Concepts:{" "}
                {snapshot.concepts.map((c) => c.name).join("; ") || "None"}
              </Typography>
              <Typography>
                Current evidence:{" "}
                {(snapshot.checks ?? snapshot.evidence ?? [])
                  .map(
                    (check) =>
                      `${check.label}: ${check.status}; claim: ${
                        check.claim || "Unknown"
                      }; scope: ${check.scope || "Unknown"}; source: ${
                        check.source || "Unknown"
                      }; date: ${check.date || "Unknown"}; application: ${
                        check.application || "Unknown"
                      }`
                  )
                  .join(" | ") || "No evidence recorded"}
              </Typography>
              {snapshot.stoneStudioDesigns?.map(
                ({ design, revision, updatedAt }) => (
                  <Box
                    key={design.id}
                    sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}
                  >
                    <Typography variant="h3">Studio: {design.name}</Typography>
                    <Typography>
                      Design {design.id} / Saved revision {revision} / Geometry
                      revision {design.geometryRevision} / {updatedAt}
                    </Typography>
                    <Typography>
                      {design.room.name}: {design.room.length} x{" "}
                      {design.room.width} m / Height {design.room.height} m /
                      Display unit {design.room.unit}
                    </Typography>
                    {(["A", "B"] as const).map((option) => (
                      <Typography key={option}>
                        Option {option}:{" "}
                        {Object.entries(design.options[option].assignments)
                          .map(
                            ([surface, a]) =>
                              `${surface}: ${a.assetId}; ${a.mode} ${
                                a.widthM
                              } x ${a.heightM} m; rotation ${
                                a.rotation
                              }; grout ${a.groutMm} mm ${
                                a.groutColor
                              }; dimensions ${
                                a.dimensionsAssumed
                                  ? "assumed"
                                  : "not marked assumed; verify source"
                              }`
                          )
                          .join(" | ") || "No material assignments"}
                      </Typography>
                    ))}
                  </Box>
                )
              )}
              {snapshot.notes && (
                <Typography>
                  Private notes:{" "}
                  {snapshot.notes.map((n) => n.text).join("; ") || "None"}
                </Typography>
              )}
              {snapshot.quote && (
                <>
                  <Typography>
                    Saved quote revision {snapshot.quote.revision}:{" "}
                    {snapshot.quote.lines
                      .map(
                        (l) =>
                          `${l.description}: ${l.quantity || "unknown"} ${
                            l.unit
                          }, ${l.currency} ${l.rate || "unknown"} per unit, ${
                            l.discountPct
                          }% discount`
                      )
                      .join("; ")}
                  </Typography>
                  <Typography>
                    Assumptions: {snapshot.quote.assumptions.join("; ")} ·
                    Exclusions: {snapshot.quote.exclusions.join("; ")}
                  </Typography>
                </>
              )}
            </Stack>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setSnapshot(undefined)}>
            Keep reviewing
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!snapshot) return;
              try {
                onRebase(snapshot.version);
                setSnapshot(undefined);
                setError("");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Refresh and review again"
                );
              }
            }}
          >
            Use reviewed revision for next save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
export const columnGrid = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", md: "minmax(0, 2fr) minmax(260px, 1fr)" },
  gap: 3,
};
export function Panel({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent>
        {title && (
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            mb={2}
          >
            <Typography variant="h3">{title}</Typography>
            {action}
          </Stack>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      justifyContent="space-between"
      alignItems={{ xs: "stretch", sm: "center" }}
      gap={2}
      mb={3}
    >
      <Box>
        {eyebrow && (
          <Typography
            variant="body2"
            sx={{
              textTransform: "uppercase",
              letterSpacing: ".14em",
              color: "text.secondary",
              mb: 1,
            }}
          >
            {eyebrow}
          </Typography>
        )}
        <Typography variant="h2" sx={{ fontSize: { xs: 26, md: 32 } }}>
          {title}
        </Typography>
        {description && (
          <Typography color="text.secondary" mt={1}>
            {description}
          </Typography>
        )}
      </Box>
      {action}
    </Stack>
  );
}
export function StatusBadge({
  label,
  warning = false,
}: {
  label: string;
  warning?: boolean;
}) {
  return (
    <Chip
      icon={<CheckCircleOutlineRoundedIcon />}
      variant="outlined"
      color={warning ? "warning" : "default"}
      label={label.replaceAll("_", " ")}
    />
  );
}
export function LoadingState() {
  return (
    <Stack spacing={2} aria-label="Loading data">
      <Skeleton height={56} width="55%" />
      <Skeleton variant="rounded" height={180} />
      <Skeleton variant="rounded" height={120} />
    </Stack>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Box sx={{ py: 5, px: 2, textAlign: "center" }}>
      <Typography variant="h3">{title}</Typography>
      <Typography color="text.secondary" my={2}>
        {description}
      </Typography>
      {action}
    </Box>
  );
}
export function LoadError({
  message,
  retry,
}: {
  message?: string;
  retry: () => void;
}) {
  return (
    <Alert severity="error" action={<Button onClick={retry}>Try again</Button>}>
      <strong>Unable to load</strong>
      <br />
      {message ||
        "The workspace could not be loaded. Your saved data has not been changed."}
    </Alert>
  );
}
export function ReferenceUnavailable({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <Box
      sx={{
        aspectRatio: compact ? undefined : "4 / 3",
        minHeight: compact ? 96 : 160,
        backgroundColor: taruviTokens.hmg.background,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        p: 3,
        borderBottom: 1,
        borderColor: "divider",
        gap: 1,
        textAlign: "center",
      }}
    >
      <ImageNotSupportedRoundedIcon
        sx={{ color: "text.secondary", fontSize: 28 }}
      />
      <Typography variant="body2">Gallery reference unavailable</Typography>
      <Typography variant="body2" color="text.secondary">
        No eligible gallery image is verified for this concept.
      </Typography>
    </Box>
  );
}
export function NextLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Button
      component={RouterLink}
      to={to}
      variant="contained"
      endIcon={<ArrowForwardRoundedIcon />}
    >
      {children}
    </Button>
  );
}
export function Crumbs({
  project,
  name,
  current,
}: {
  project?: string;
  name?: string;
  current: string;
}) {
  return (
    <Breadcrumbs sx={{ mb: 2 }}>
      <Link component={RouterLink} to="/studio" color="inherit">
        Selection Studio
      </Link>
      {project && (
        <Link
          component={RouterLink}
          to={`/projects/${project}`}
          color="inherit"
        >
          {name || "Project"}
        </Link>
      )}
      <Typography variant="body2">{current}</Typography>
    </Breadcrumbs>
  );
}
export interface CommandDialogSpec {
  title: string;
  description: string;
  label: string;
  destructive?: boolean;
  reason?: boolean;
  initialReason?: string;
  onConfirm: (reason: string) => Promise<unknown>;
}
export function CommandDialog({
  spec,
  close,
  container,
}: {
  spec: CommandDialogSpec | null;
  close: () => void;
  container?: HTMLElement | null;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (spec) {
      setReason(spec.initialReason || "");
      setError("");
    }
  }, [spec]);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await spec?.onConfirm(reason);
      close();
      setReason("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Not saved. Your edits remain here; retry after reviewing the error."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      container={container}
      open={!!spec}
      onClose={busy ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{spec?.title}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {spec?.description}
          {spec?.destructive && " This action cannot be undone."}
        </DialogContentText>
        {spec?.reason && (
          <TextField
            autoFocus
            fullWidth
            required
            multiline
            minRows={3}
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            inputProps={{ maxLength: 500 }}
            helperText={`${reason.length}/500 characters`}
            sx={{ mt: 3 }}
          />
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy} variant="outlined">
          Cancel
        </Button>
        <Button
          color={spec?.destructive ? "error" : "primary"}
          variant="contained"
          disabled={busy || (!!spec?.reason && !reason.trim())}
          startIcon={busy ? <CircularProgress size={16} /> : undefined}
          onClick={submit}
        >
          {busy ? "Saving…" : spec?.label}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
