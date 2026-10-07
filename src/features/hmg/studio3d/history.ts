export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}
/** Undo restores content, never an old server geometry counter. Camera is shared. */
export function reconcileGeometryRevision<
  T extends { room: unknown; geometryRevision: number; camera: unknown }
>(current: T, next: T, serverFloor = 0): T {
  const floor = Math.max(
    current.geometryRevision,
    next.geometryRevision,
    serverFloor
  );
  return {
    ...next,
    camera: current.camera,
    geometryRevision:
      floor +
      (JSON.stringify(current.room) !== JSON.stringify(next.room) ? 1 : 0),
  };
}
export function commitHistory<T>(state: History<T>, next: T): History<T> {
  if (JSON.stringify(next) === JSON.stringify(state.present)) return state;
  return {
    past: [...state.past, state.present].slice(-40),
    present: next,
    future: [],
  };
}
export function undoHistory<T>(state: History<T>): History<T> {
  if (!state.past.length) return state;
  return {
    past: state.past.slice(0, -1),
    present: state.past[state.past.length - 1],
    future: [state.present, ...state.future],
  };
}
export function redoHistory<T>(state: History<T>): History<T> {
  if (!state.future.length) return state;
  return {
    past: [...state.past, state.present].slice(-40),
    present: state.future[0],
    future: state.future.slice(1),
  };
}
