import {
  Alert,
  Box,
  Button,
  Chip,
  Drawer,
  Stack,
  Typography,
} from "@mui/material";
import type { HmgOption, HmgProject } from "../types";

export function EvidenceDrawer({
  open,
  onClose,
  project,
  option,
}: {
  open: boolean;
  onClose: () => void;
  project?: HmgProject;
  option?: HmgOption;
}) {
  const evidence = (project?.checks ?? project?.evidence ?? []).filter(
    (e) => !option || e.subjectType === "project" || e.optionId === option.id
  );
  const eligibility = option && project?.eligibility?.[option.id];
  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box
        sx={{ width: { xs: "100vw", sm: 520 }, p: 3 }}
        role="region"
        aria-label="Evidence and unknowns"
      >
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="h2">Evidence & unknowns</Typography>
          <Button onClick={onClose}>Close</Button>
        </Stack>
        <Typography mt={2}>
          {option?.title || project?.name || "Reference evidence"}
        </Typography>
        <Alert
          severity={eligibility?.status === "Blocked" ? "error" : "info"}
          sx={{ my: 2 }}
        >
          {eligibility?.status || "Unknown"} — appearance is not technical
          approval. {(eligibility?.reasons || []).join(" ")}
        </Alert>
        {!evidence.length && (
          <Alert severity="info">
            No scoped evidence has been recorded for this selection. Material
            identity, care, application suitability, measurements, exact slab
            and availability remain unknown.
          </Alert>
        )}
        <Stack gap={2}>
          {evidence.map((e) => (
            <Box
              key={e.id}
              sx={{ borderBottom: 1, borderColor: "divider", pb: 2 }}
            >
              <Typography variant="h3">{e.label}</Typography>
              <Chip label={e.status} />
              {e.customerVisible === false && (
                <Chip label="Staff only" variant="outlined" />
              )}
              {e.hardMismatch && (
                <Alert severity="error">
                  Hard mismatch — cannot prefer this option.
                </Alert>
              )}
              <Typography>{e.claim || "Claim not recorded"}</Typography>
              <Typography>Source: {e.source || "Unknown"}</Typography>
              <Typography>
                Scope: {e.scope || "Unknown"} ·{" "}
                {e.application || "Application unknown"}
              </Typography>
              <Typography>
                Date: {e.date || "Unknown"} · Selection v{e.selectionVersion}
              </Typography>
              {e.selectionVersion !== project?.selectionVersion && (
                <Alert severity="warning">
                  Historical evidence; selection has changed. Reverification
                  required.
                </Alert>
              )}
              <Typography>
                Unknowns:{" "}
                {e.unknowns?.join("; ") ||
                  "No unknowns recorded — not a guarantee of completeness"}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </Drawer>
  );
}
