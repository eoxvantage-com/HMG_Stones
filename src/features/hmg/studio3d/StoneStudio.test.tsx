// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { StoneStudio } from "./StoneStudio";
import { createDesign, surfaces } from "./geometry";
import type { StudioDesignV2 } from "./types";
import type { HmgProject } from "../types";
const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  refresh: vi.fn(),
  project: {} as HmgProject,
  warn: vi.fn(),
  eligible: true,
  legacy: false,
  readonly: false,
  canPrice: false,
  handoff: false,
  queried: vi.fn(),
}));
vi.mock("@refinedev/core", () => ({
  useWarnAboutChange: () => ({ setWarnWhen: mocks.warn }),
}));
vi.mock("../components/AppShell", () => ({
  useWorkspace: () => ({
    actorId: "customer",
    canCreate: true,
    isStaff: mocks.readonly,
    canPrice: mocks.canPrice,
    isExecutive: false,
  }),
}));
vi.mock("../api", () => ({
  useWorkflow: (command: string) => (
    mocks.queried(command),
    {
      data: ["getProject", "getSalesProject"].includes(command)
        ? mocks.project
        : { data: [mocks.project], total: 1 },
      refreshValue: () => mocks.refresh(),
      refetch: vi.fn(),
    }
  ),
  useProjectCommand: () => ({
    run: mocks.run,
    busy: false,
    rebase: (v: number) => v,
  }),
}));
vi.mock("./BlueprintViewport", () => ({
  BlueprintViewport: ({ document, onSelectSurface }: any) => (
    <div>
      {surfaces(document).map((surface) => (
        <button
          key={surface.id}
          onClick={() => onSelectSurface(surface.id)}
        >
          {surface.kind === "floor" ? `Planner floor ${document.room.length}` : `Renderer ${surface.name}`}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('../plan3d/FullHomePlanViewer', () => ({
  FullHomePlanViewer: ({assignments,onEditRoom,layout}:any) => <div>
    <output aria-label="Whole home assignments">{JSON.stringify(assignments)}</output>
    {layout.rooms.map((room:any)=><button key={room.id} onClick={()=>onEditRoom(room.id)}>Edit home {room.name}</button>)}
  </div>,
}));
vi.mock("../galleryApi", () => ({
  useMaterial: () => ({
    data: mocks.legacy
      ? {
          id: "hmg-stone-sample",
          title: "Legacy material",
          surfaceEligible: true,
          width: 1000,
          height: 2000,
        }
      : undefined,
    refetch: vi.fn(),
  }),
}));
vi.mock("../components/GalleryBrowser", () => ({
  GalleryBrowser: ({ onSelect }: any) => (
    <button
      onClick={() =>
        onSelect({
          id: "hmg-stone-sample",
          title: "Official material",
          url: "/api/hmg/material-assets/hmg-stone-sample",
          surfaceEligible: mocks.eligible,
          sourcePageUrl: "https://www.hmgstones.com/product/sample",
          sourceCaption: "Official material",
          width: 1000,
          height: 2000,
          eligibilityReason: "Reviewed material image",
        })
      }
    >
      Choose material
    </button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.refresh.mockImplementation(async () => mocks.project);
  mocks.handoff = false;
  mocks.canPrice = false;
  mocks.legacy = false;
  mocks.eligible = true;
  mocks.readonly = false;
});
const setup = (saved = false, emptyRoom = false, designOverride?: StudioDesignV2, omitDesignParam = false) => {
  mocks.refresh.mockImplementation(async () => mocks.project);
  const design = designOverride || createDesign("p");
  if (emptyRoom) design.objects = [];
  if (mocks.legacy)
    design.options.A.assignments[`${design.room.id}:floor`] = {
      assetId: "hmg-stone-sample",
      mode: "tile",
      widthM: 0.05,
      heightM: 10,
      rotation: 0,
      groutMm: 2,
      groutColor: "#cccccc",
      dimensionsAssumed: true,
    };
  mocks.project = {
    id: "p",
    name: "Room project",
    version: 5,
    archived: false,
    stoneStudioDesigns: saved ? [{ design, revision: 1, updatedAt: "" }] : [],
    quote: mocks.handoff ? { id: "p" } : undefined,
    studioQuoteSummaries: mocks.handoff
      ? [
          {
            id: "summary",
            designId: design.id,
            designRevision: 1,
            geometryRevision: 1,
            option: "A",
            totalAreaM2: "20",
            status: "Unpriced preliminary summary",
            lines: [
              {
                surfaceId: `${design.room.id}:floor`,
                assetId: "hmg-stone-sample",
                areaM2: "20",
                name: "Floor",
              },
            ],
            assumptions: [],
            exclusions: [],
          },
        ]
      : [],
  } as unknown as HmgProject;
  render(
    <MemoryRouter
      initialEntries={[
        `/studio-3d?projectId=p${saved && !omitDesignParam ? `&designId=${design.id}` : ""}`,
      ]}
    >
      <StoneStudio />
    </MemoryRouter>
  );
  return design;
};
it('updates whole-home stone assignments from live editor changes and confirms room switching', async () => {
  const first=createDesign('p'), second=createDesign('p','Bedroom');
  mocks.project={id:'p',name:'Home',version:1,archived:false,
    stoneStudioDesigns:[{design:first,revision:1,updatedAt:''},{design:second,revision:1,updatedAt:''}],
    planUploads:[{id:'upload',generatedDesignIds:[first.id,second.id],reviewed:{rooms:[
      {id:'hall',name:'Hall',category:'hall',lengthFt:10,widthFt:8,heightFt:10,includeFloor:true,includeInteriorWalls:true},
      {id:'bed',name:'Bedroom',category:'bedroom',lengthFt:10,widthFt:8,heightFt:10,includeFloor:true,includeInteriorWalls:true},
    ]}}],
  } as unknown as HmgProject;
  render(<MemoryRouter initialEntries={[`/studio-3d?projectId=p&designId=${first.id}`]}><StoneStudio /></MemoryRouter>);
  await screen.findByText('Saved on Taruvi');
  fireEvent.click(screen.getByRole('button',{name:'Whole home'}));
  fireEvent.click(screen.getByRole('button',{name:'Choose material'}));
  expect(JSON.parse(screen.getByLabelText('Whole home assignments').textContent || '{}')['hall:floor'].assetId).toBe('hmg-stone-sample');
  fireEvent.click(screen.getByRole('button',{name:'Clear this surface assignment'}));
  expect(JSON.parse(screen.getByLabelText('Whole home assignments').textContent || '{}')['hall:floor']).toBeUndefined();
  fireEvent.click(screen.getByRole('tab',{name:'Stones'}));
  fireEvent.click(screen.getByRole('button',{name:'Choose material'}));
  fireEvent.click(screen.getByRole('button',{name:'Edit home Bedroom'}));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByText(/Save your current room before switching/)).toBeTruthy();
  mocks.refresh.mockResolvedValue(mocks.project);
  mocks.run.mockImplementation(async (_cmd:string,payload:{design:typeof first}) => {
    mocks.project={...mocks.project,version:2,stoneStudioDesigns:[{design:payload.design,revision:2,updatedAt:''},{design:second,revision:1,updatedAt:''}]};
    return mocks.project;
  });
  mocks.run.mockRejectedValueOnce(new Error('Test save failure'));
  fireEvent.click(screen.getByRole('button',{name:'Save and switch'}));
  await screen.findByText(/The current room was not saved/);
  expect(screen.queryByText('Home / Bedroom')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Save and switch'}));
  await screen.findByText('Home / Bedroom');
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(await screen.findByRole('tab',{name:'Stones'}));
  fireEvent.click(screen.getByRole('button',{name:'Choose material'}));
  const assignments=JSON.parse(screen.getByLabelText('Whole home assignments').textContent || '{}');
  expect(assignments['hall:floor'].assetId).toBe('hmg-stone-sample');
  expect(assignments['bed:floor'].assetId).toBe('hmg-stone-sample');
}, 15000);
it("keeps untextured geometry usable and never offers fake material application", () => {
  setup();
  fireEvent.click(screen.getByRole("tab", { name: "Layout" }));
  expect(
    (
      screen.getByRole("button", {
        name: "Apply to selected surface",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(screen.getByText(/Choose a verified HMG material/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Planner floor/ }));
  expect(screen.getByText(/20.00 m2 preliminary area/)).toBeTruthy();
  expect(mocks.run).not.toHaveBeenCalled();
});
it("restores the requested document and saves through captured revision", async () => {
  const design = setup(true);
  await waitFor(() => expect(screen.getByText("Saved on Taruvi")).toBeTruthy());
  mocks.run.mockResolvedValue({
    ...mocks.project,
    version: 6,
    stoneStudioDesigns: [{ design, revision: 2, updatedAt: "" }],
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(mocks.run).toHaveBeenCalledWith("saveStudioDesign", { design }, 5)
  );
});
it("opens the first saved design when a project link has no designId", async () => {
  const design = setup(true, false, undefined, true);
  await screen.findByText("Saved on Taruvi");
  expect(screen.getByText(`Room project / ${design.room.name}`)).toBeTruthy();
});
it("refreshes the project revision before saving when only unrelated project data changed", async () => {
  const design = setup(true);
  await screen.findByText("Saved on Taruvi");
  mocks.project = { ...mocks.project, version: 6 };
  mocks.run.mockResolvedValue({ ...mocks.project, version: 7, stoneStudioDesigns: [{ design, revision: 2 }] });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mocks.run).toHaveBeenCalledWith("saveStudioDesign", { design }, 6));
});
it("does not overwrite a saved design changed by another editor", async () => {
  const design = setup(true);
  await screen.findByText("Saved on Taruvi");
  mocks.project = { ...mocks.project, version: 6, stoneStudioDesigns: [{ design, revision: 2, updatedAt: "" }] };
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText(/saved design changed elsewhere/i)).toBeTruthy();
  expect(mocks.run).not.toHaveBeenCalled();
});
it("preserves a conflicted draft by saving it as a new design instead of overwriting the latest", async () => {
  const design = setup(true);
  await screen.findByText("Saved on Taruvi");
  mocks.project = { ...mocks.project, version: 6, stoneStudioDesigns: [{ design: { ...design, name: "Latest from another editor" }, revision: 2, updatedAt: "" }] };
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText(/saved design changed elsewhere/i);
  let savedCopyId = "";
  mocks.run.mockImplementation(async (_command, payload) => {
    const savedCopy = payload.design;
    savedCopyId = savedCopy.id;
    return { ...mocks.project, version: 7, stoneStudioDesigns: [...(mocks.project.stoneStudioDesigns || []), { design: savedCopy, revision: 1, updatedAt: "" }] };
  });
  fireEvent.click(screen.getByRole("button", { name: "Save edits as new design" }));
  await waitFor(() => expect(mocks.run).toHaveBeenCalledWith("saveStudioDesign", { design: expect.objectContaining({ projectId: design.projectId }) }, 6));
  expect(savedCopyId).not.toBe(design.id);
  await waitFor(() => expect(screen.getByText("Saved on Taruvi")).toBeTruthy());
});
it("only prepares a quote for a saved clean design using both revisions", async () => {
  const design = setup(true);
  await screen.findByText("Saved on Taruvi");
  mocks.run.mockResolvedValue({ ...mocks.project, version: 6 });
  fireEvent.click(screen.getByRole("button", { name: "Prepare quote" }));
  await waitFor(() =>
    expect(mocks.run).toHaveBeenCalledWith(
      "prepareStudioQuote",
      {
        designId: design.id,
        option: "A",
        designRevision: 1,
        geometryRevision: 1,
      },
      5
    )
  );
});

it("selecting an eligible stone immediately applies to default floor without dimension inputs, and undo restores it", async () => {
  const design = setup(true);
  await screen.findByText("Saved on Taruvi");
  fireEvent.click(screen.getByRole("button", { name: "Choose material" }));
  expect(
    screen.getByRole("tab", { name: "Layout" }).getAttribute("aria-selected")
  ).toBe("true");
  expect(screen.queryByLabelText(/Preview width/)).toBeNull();
  mocks.run.mockResolvedValue({
    ...mocks.project,
    version: 6,
    stoneStudioDesigns: [{ design, revision: 2 }],
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mocks.run).toHaveBeenCalled());
  const saved = mocks.run.mock.calls[0][1].design;
  expect(saved.options.A.assignments[`${design.room.id}:floor`]).toMatchObject({
    assetId: "hmg-stone-sample",
    mode: "surface",
    widthM: design.room.length,
    heightM: design.room.width,
    groutMm: 0,
    dimensionsAssumed: true,
  });
  expect(saved.options.B.assignments).toEqual({});
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getByText(/0 assigned surfaces/)).toBeTruthy();
});
it("selects generated polygon walls and applies a stone to that exact stable surface", async () => {
  const base = createDesign("p");
  const design: StudioDesignV2 = {
    ...base,
    schemaVersion: 2,
    objects: [],
    room: {
      ...base.room,
      length: 5,
      width: 4,
      perimeter: [
        { id: "a", xM: 0, zM: 0 },
        { id: "b", xM: 5, zM: 0 },
        { id: "c", xM: 5, zM: 2 },
        { id: "d", xM: 3, zM: 2 },
        { id: "e", xM: 3, zM: 4 },
        { id: "f", xM: 0, zM: 4 },
      ],
    },
  };
  setup(true, false, design);
  await screen.findByText("Saved on Taruvi");
  fireEvent.click(screen.getByRole("button", { name: "Renderer Wall 3 interior wall" }));
  expect(screen.getAllByRole("button").some((button) =>
    button.textContent?.includes("Wall 3 interior wall") && button.getAttribute("aria-pressed") === "true"
  )).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Choose material" }));
  mocks.run.mockImplementation(async (_command: string, payload: { design: StudioDesignV2 }) => ({
    ...mocks.project,
    version: 6,
    stoneStudioDesigns: [{ design: payload.design, revision: 2, updatedAt: "" }],
  }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mocks.run).toHaveBeenCalled());
  const saved = mocks.run.mock.calls.at(-1)?.[1].design as StudioDesignV2;
  const wallId = surfaces(design).find((surface) => surface.name === "Wall 3 interior wall")!.id;
  expect(saved.options.A.assignments[wallId]).toMatchObject({
    assetId: "hmg-stone-sample",
    mode: "surface",
    widthM: surfaces(design).find((surface) => surface.id === wallId)!.width,
    heightM: design.room.height,
  });
  expect(saved.options.A.assignments[`${design.room.id}:floor`]).toBeUndefined();
});
it.each(["readonly", "ineligible"])(
  "does not auto apply when %s",
  async (kind) => {
    mocks.readonly = kind === "readonly";
    mocks.eligible = kind !== "ineligible";
    setup(true);
    await screen.findByText("Saved on Taruvi");
    fireEvent.click(screen.getByRole("button", { name: "Choose material" }));
    expect(screen.getByText(/0 assigned surfaces/)).toBeTruthy();
    expect(mocks.run).not.toHaveBeenCalled();
  }
);
it("fullscreen and panel toggles preserve the mounted planner", async () => {
  setup();
  const planner = screen.getByRole("button", { name: /Planner floor/ });
  const request = vi.fn(async function (this: HTMLElement) {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: this,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: request,
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: vi.fn(async () => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: null,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    }),
  });
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Fullscreen workspace" })
    );
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: /Planner floor/ })).toBe(planner);
  fireEvent.click(screen.getByRole("button", { name: "Hide room controls" }));
  fireEvent.click(screen.getByRole("button", { name: "Hide materials" }));
  expect(screen.getByRole("button", { name: /Planner floor/ })).toBe(planner);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
  });
  expect(screen.getByRole("button", { name: /Planner floor/ })).toBe(planner);
  delete (HTMLElement.prototype as any).requestFullscreen;
});

it("resizes the material panel with keyboard controls and persists the width", async () => {
  localStorage.clear();
  setup();
  const planner = screen.getByRole("button", { name: /Planner floor/ });
  const separator = screen.getByRole("separator", {
    name: "Resize stone materials panel",
  });
  expect(separator.getAttribute("aria-valuenow")).toBe("360");
  fireEvent.keyDown(separator, { key: "ArrowLeft" });
  expect(separator.getAttribute("aria-valuenow")).toBe("376");
  expect(localStorage.getItem("hmg.studio.material-panel-width")).toBe("376");
  expect(screen.getByRole("button", { name: /Planner floor/ })).toBe(planner);
});

it("resizes the material panel with pointer input and clamps at its maximum", () => {
  localStorage.clear();
  setup();
  const separator = screen.getByRole("separator", {
    name: "Resize stone materials panel",
  });
  fireEvent.pointerDown(separator, { clientX: 700, pointerId: 1 });
  fireEvent.pointerMove(separator, { clientX: 100, pointerId: 1 });
  fireEvent.pointerUp(separator, { clientX: 100, pointerId: 1 });
  expect(separator.getAttribute("aria-valuenow")).toBe("560");
});

it("restores and bounds a stored material panel width", () => {
  localStorage.setItem("hmg.studio.material-panel-width", "900");
  setup();
  const separator = screen.getByRole("separator", {
    name: "Resize stone materials panel",
  });
  expect(separator.getAttribute("aria-valuenow")).toBe("560");
  fireEvent.keyDown(separator, { key: "End" });
  expect(separator.getAttribute("aria-valuenow")).toBe("560");
  fireEvent.keyDown(separator, { key: "Home" });
  expect(separator.getAttribute("aria-valuenow")).toBe("280");
});

it("filters room-item catalogue and supports add, select, move, rotate, remove, and undo", async () => {
  localStorage.clear();
  setup(true, true);
  await screen.findByText("Saved on Taruvi");
  fireEvent.click(screen.getByRole("button", { name: "Room geometry & saved designs" }));
  fireEvent.click(screen.getByRole("button", { name: /Add room items/ }));
  fireEvent.change(screen.getByLabelText("Find room items"), {
    target: { value: "coffee" },
  });
  expect(screen.getByRole("button", { name: "Add Coffee table" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Add Lounge armchair" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Add Coffee table" }));
  expect(screen.getAllByRole("button", { name: "Select Coffee table" })).toHaveLength(1);
  const placedCoffeeTable = () => screen.getAllByRole("button", { name: "Select Coffee table" })
    .find((button) => button.getAttribute("aria-pressed") === "true") as HTMLButtonElement;
  const positionBeforeMove = placedCoffeeTable().textContent;
  fireEvent.click(screen.getByRole("button", { name: "Move selected item right" }));
  expect(placedCoffeeTable().textContent).not.toBe(positionBeforeMove);
  expect(screen.getByText(/Position:/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Move selected item back" }));
  fireEvent.click(screen.getByRole("button", { name: "Move selected item back" }));
  fireEvent.click(screen.getByRole("button", { name: "Rotate selected item" }));
  expect(screen.getByText(/Rotation: 90/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Remove selected item" }));
  fireEvent.click(await screen.findByRole("button", { name: "Remove item" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(screen.queryByRole("button", { name: "Select Coffee table" })).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getAllByRole("button", { name: "Select Coffee table" })).toHaveLength(1);
}, 15000);

it("replaces room-template furniture while preserving room identity and surface assignments", async () => {
  const initial = createDesign("p");
  initial.options.A.assignments[`${initial.room.id}:floor`] = {
    assetId: "hmg-stone-sample",
    mode: "surface",
    widthM: 5,
    heightM: 4,
    rotation: 0,
    groutMm: 0,
    groutColor: "#cccccc",
    dimensionsAssumed: true,
  };
  mocks.project = {
    id: "p",
    name: "Room project",
    version: 5,
    archived: false,
    stoneStudioDesigns: [{ design: initial, revision: 1, updatedAt: "" }],
    studioQuoteSummaries: [],
  } as unknown as HmgProject;
  render(
    <MemoryRouter initialEntries={[`/studio-3d?projectId=p&designId=${initial.id}`]}>
      <StoneStudio />
    </MemoryRouter>
  );
  await screen.findByText("Saved on Taruvi");
  fireEvent.click(screen.getByRole("button", { name: "Room geometry & saved designs" }));
  fireEvent.click(screen.getByRole("button", { name: "Meeting / reception" }));
  fireEvent.click(await screen.findByRole("button", { name: "Update both options" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  mocks.run.mockImplementation(async (_command, args) => ({
    ...mocks.project,
    version: 6,
    stoneStudioDesigns: [{ design: args.design, revision: 2 }],
  }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mocks.run).toHaveBeenCalled());
  const saved = mocks.run.mock.calls[0][1].design;
  expect(saved.room.id).toBe(initial.room.id);
  expect(saved.options.A.assignments[`${initial.room.id}:floor`].assetId).toBe("hmg-stone-sample");
  expect(saved.objects.map((item: {kind:string}) => item.kind)).toContain("meeting-table");
});

it("retains legacy tile dimensions until explicit Fit image to surface repair", async () => {
  mocks.legacy = true;
  const design = setup(true);
  await screen.findByText("Saved on Taruvi");
  fireEvent.click(screen.getByRole("button", { name: /Planner floor/ }));
  fireEvent.click(screen.getByRole("tab", { name: "Layout" }));
  expect(
    (screen.getByLabelText(/Preview width/) as HTMLInputElement).value
  ).toBe("0.05");
  expect(screen.getByText(/extreme aspect ratio/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Fit image to surface" }));
  expect(screen.queryByLabelText(/Preview width/)).toBeNull();
  mocks.run.mockResolvedValue({
    ...mocks.project,
    version: 6,
    stoneStudioDesigns: [{ design, revision: 2 }],
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mocks.run).toHaveBeenCalled());
  expect(
    mocks.run.mock.calls[0][1].design.options.A.assignments[
      `${design.room.id}:floor`
    ]
  ).toMatchObject({ mode: "surface", widthM: 5, heightM: 4 });
});

it("pricing staff handoff reads authorized sales projection and confirms existing quote replacement", async () => {
  mocks.canPrice = true;
  mocks.handoff = true;
  setup(true);
  await screen.findByText("Saved on Taruvi");
  expect(mocks.queried).toHaveBeenCalledWith("getSalesProject");
  fireEvent.click(screen.getByRole("button", { name: /Review Option A/ }));
  fireEvent.click(
    screen.getByRole("button", {
      name: "Create quotation draft from this summary",
    })
  );
  expect(mocks.run).not.toHaveBeenCalled();
  expect(screen.getByText(/Previous quote history is retained/)).toBeTruthy();
  mocks.run.mockResolvedValue({ id: "p" });
  fireEvent.click(
    screen.getByRole("button", { name: "Replace working draft" })
  );
  await waitFor(() =>
    expect(mocks.run).toHaveBeenCalledWith(
      "createStudioQuoteDraft",
      { summaryId: "summary", replaceExisting: true },
      5
    )
  );
});
it("customer handoff uses safe projection and has no pricing action", async () => {
  mocks.handoff = true;
  setup(true);
  await screen.findByText("Saved on Taruvi");
  expect(mocks.queried).toHaveBeenCalledWith("getProject");
  expect(mocks.queried).not.toHaveBeenCalledWith("getSalesProject");
  fireEvent.click(screen.getByRole("button", { name: /Review Option A/ }));
  expect(
    screen.queryByRole("button", {
      name: "Create quotation draft from this summary",
    })
  ).toBeNull();
  expect(screen.getByText(/Only authorized pricing staff/)).toBeTruthy();
});

it('locks save during deferred refresh, prevents duplicate writes, and unlocks after success', async () => {
  setup();
  let resolveRefresh!: (project: HmgProject) => void;
  mocks.refresh.mockImplementation(() => new Promise<HmgProject>(resolve => {resolveRefresh = resolve;}));
  mocks.run.mockImplementation(async (_command, payload) => ({...mocks.project, version: 6, stoneStudioDesigns: [{design: payload.design, revision: 1}]}));
  const button = screen.getByRole('button', {name: 'Save'}) as HTMLButtonElement;
  fireEvent.click(button); fireEvent.click(button);
  expect(button.disabled).toBe(true);
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  expect(mocks.run).not.toHaveBeenCalled();
  await act(async () => {resolveRefresh(mocks.project);});
  await waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(1));
  expect(button.disabled).toBe(false);
  expect(screen.getByText('Saved on Taruvi')).toBeTruthy();
});
it('unlocks save after refresh failure while retaining edits for retry', async () => {
  setup();
  mocks.refresh.mockRejectedValueOnce(new Error('Refresh failed; edits retained'));
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  expect(await screen.findByText(/Refresh failed; edits retained/)).toBeTruthy();
  expect((screen.getByRole('button', {name: 'Save'}) as HTMLButtonElement).disabled).toBe(false);
  expect(mocks.run).not.toHaveBeenCalled();
});
it('reopens an unchanged summary without preparing another record and separates history', async () => {
  mocks.handoff = true;
  setup(true);
  const original=mocks.project.studioQuoteSummaries![0];
  mocks.project.studioQuoteSummaries!.push({...original,id:'duplicate'});
  fireEvent.click(screen.getByRole('button',{name:'Prepare quote'}));
  await screen.findByText('Unpriced studio quote review');
  expect(mocks.run).not.toHaveBeenCalled();
  expect(screen.getByRole('button',{name:/Summary history \(1\)/})).toBeTruthy();
});
it('locks prepare immediately while the first submission is pending', async () => {
  setup(true);
  let resolve!: (value:any)=>void;
  mocks.run.mockImplementation(()=>new Promise(r=>{resolve=r;}));
  const button=screen.getByRole('button',{name:'Prepare quote'});
  fireEvent.click(button);fireEvent.click(button);
  expect(mocks.run).toHaveBeenCalledTimes(1);
  await act(async()=>{resolve({...mocks.project,version:6});});
});
