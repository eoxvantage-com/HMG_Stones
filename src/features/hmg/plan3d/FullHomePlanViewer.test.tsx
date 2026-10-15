// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFullHomeLayout, type FullHomeLayout } from "./fullHomeLayout";
import { FullHomePlanViewer, renderableRoomParts, pickHomeSurface } from "./FullHomePlanViewer";
import * as THREE from 'three';
import type { HmgReviewedPlanRoom } from "./planTypes";

const room = (overrides: Partial<HmgReviewedPlanRoom>): HmgReviewedPlanRoom => ({
  id: "room",
  name: "Room",
  category: "hall",
  lengthFt: 10,
  widthFt: 8,
  heightFt: 10,
  includeFloor: true,
  includeInteriorWalls: true,
  ...overrides,
});

afterEach(cleanup);

describe("FullHomePlanViewer", () => {
  it.each([false,true])('selects a floor from its card and status chip when assigned=%s, including the active room', (assigned) => {
    const edit=vi.fn();
    render(<FullHomePlanViewer layout={layout()} activeRoomId="room-1" assignments={assigned ? {'room-1:floor':{assetId:'hmg-stone-amarone'}} : {}} onEditRoom={edit} renderCanvas={false} />);
    fireEvent.click(screen.getByRole('button',{name:'Select Room 1 floor'}));
    expect(edit).toHaveBeenLastCalledWith('room-1','floor');
    fireEvent.click(screen.getByRole('button',{name:assigned ? 'Floor assigned' : 'Floor unassigned'}));
    expect(edit).toHaveBeenCalledTimes(2);
    expect(edit).toHaveBeenLastCalledWith('room-1','floor');
  });
  it('raycasts the floor of each room independently', () => {
    const camera=new THREE.PerspectiveCamera(60,1,0.1,100);
    camera.position.set(0,8,8);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const geometry=new THREE.BoxGeometry(2,0.1,2), material=new THREE.MeshBasicMaterial();
    const rooms=[-2,2].map((x,index)=>{
      const mesh=new THREE.Mesh(geometry,material);
      mesh.position.x=x;mesh.updateMatrixWorld();
      mesh.userData.homeSurface={roomId:`room-${index}`,surface:'floor'};
      return mesh;
    });
    rooms.forEach((room,index)=>{
      const point=room.position.clone().project(camera);
      expect(pickHomeSurface(rooms,camera,new THREE.Vector2(point.x,point.y))).toEqual({roomId:`room-${index}`,surface:'floor'});
    });
    expect(pickHomeSurface(rooms,camera,new THREE.Vector2(1,1))).toBeUndefined();
    geometry.dispose();material.dispose();
  });
  it('offers a room selector above the canvas for targeting another floor', () => {
    const edit = vi.fn();
    render(<FullHomePlanViewer layout={layout()} onEditRoom={edit} renderCanvas={false} />);
    fireEvent.mouseDown(screen.getByRole('combobox', {name:'Room to design'}));
    fireEvent.click(screen.getByRole('option', {name:'Room 1'}));
    expect(edit).toHaveBeenCalledWith('room-1', 'floor');
  });
  it('offers room editing and reflects individual wall assignments', () => {
    const edit = vi.fn();
    render(<FullHomePlanViewer layout={layout()} assignments={{'room-1:east':{assetId:'hmg-stone-amarone'}}} onEditRoom={edit} renderCanvas={false} />);
    expect(screen.getByText('Wall stone assigned')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Edit Room 1'}));
    expect(edit).toHaveBeenCalledWith('room-1','floor');
  });
  it("renders a whole-home preview summary for every reviewed room", () => {
    const layout = createFullHomeLayout([
      room({ id: "hall", name: "Hall" }),
      room({ id: "kitchen", name: "Kitchen", category: "kitchen", lengthFt: 6.5, widthFt: 7 }),
      room({ id: "bed", name: "Bedroom", category: "bedroom", lengthFt: 11, widthFt: 8.5 }),
    ]);

    render(<FullHomePlanViewer layout={layout} renderCanvas={false} />);

    expect(screen.getByText("Whole-home 3D preview")).toBeTruthy();
    expect(screen.getByText(/3 reviewed rooms/)).toBeTruthy();
    expect(screen.getByText(/Schematic arrangement derived/)).toBeTruthy();
    expect(screen.getByText("Hall")).toBeTruthy();
    expect(screen.getByText("Kitchen")).toBeTruthy();
    expect(screen.getByText("Bedroom")).toBeTruthy();
  });





  it("lists extracted plan features that will be rendered with the home preview", () => {
    const layout = createFullHomeLayout([
      room({ id: "hall", name: "Hall" }),
    ], { features: [{ label: "Stair", type: "stair", xFt: 0, zFt: 0, lengthFt: 4, widthFt: 8 }] });

    render(<FullHomePlanViewer layout={layout} renderCanvas={false} />);

    expect(screen.getByText("Plan features in preview")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("Stair") && content.includes("stair"))).toBeTruthy();
  });

  it("shows built-up area coverage instead of only modelled room boxes", () => {
    const layout = createFullHomeLayout([
      room({ id: "hall", name: "Hall", lengthFt: 10.625, widthFt: 9 }),
      room({ id: "kitchen", name: "Kitchen", category: "kitchen", lengthFt: 6.5, widthFt: 7 }),
      room({ id: "toilet", name: "Toilet", category: "toilet", lengthFt: 6, widthFt: 4.125 }),
      room({ id: "bed", name: "Bedroom", category: "bedroom", lengthFt: 11.125, widthFt: 8.5 }),
    ], { builtUpAreaSqFt: 450, buildingFacing: "north" });

    render(<FullHomePlanViewer layout={layout} renderCanvas={false} />);

    expect(screen.getByText("Built-up area")).toBeTruthy();
    expect(screen.getByText("450.0 sq ft")).toBeTruthy();
    expect(screen.getByText("Modeled rooms")).toBeTruthy();
    expect(screen.getByText("260.4 sq ft")).toBeTruthy();
    expect(screen.getByText("Unmodeled / circulation")).toBeTruthy();
    expect(screen.getByText("189.6 sq ft")).toBeTruthy();
    expect(screen.getByText("North facing building")).toBeTruthy();
  });

  it("shows an accessible empty fallback when there are no modelable rooms", () => {
    render(<FullHomePlanViewer layout={createFullHomeLayout([])} renderCanvas={false} />);

    expect(screen.getAllByText("No reviewed rooms available for whole-home 3D preview.").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: /Schematic whole-home 3D preview unavailable/i })).toBeTruthy();
  });

  it("lists extracted openings as review evidence without treating them as measured cutouts", () => {
    render(
      <FullHomePlanViewer
        layout={layout()}
        openings={[{ label: "W3", type: "window", notes: "Kitchen north wall" }]}
        renderCanvas={false}
      />
    );

    expect(screen.getByText("Extracted openings for review")).toBeTruthy();
    expect(screen.getByText(/W3/)).toBeTruthy();
    expect(screen.getByText(/Kitchen north wall/)).toBeTruthy();
    expect(screen.getByText(/not deducted from stone quantities/i)).toBeTruthy();
  });
});


const layout = (overrides: Partial<FullHomeLayout["rooms"][number]> = {}): FullHomeLayout => ({
  unit: "ft",
  bounds: { lengthFt: 10, widthFt: 8, heightFt: 10 },
  totalAreaSqFt: 80,
  warnings: [],
  features: [],
  planFeatures: [],
  rooms: [{
    id: "room-1",
    name: "Room 1",
    category: "hall",
    xFt: 0,
    zFt: 0,
    lengthFt: 10,
    widthFt: 8,
    heightFt: 10,
    areaSqFt: 80,
    includeFloor: true,
    includeInteriorWalls: true,
    ...overrides,
  }],
});

describe("renderableRoomParts", () => {
  it("respects reviewed floor and wall inclusion toggles", () => {
    expect(renderableRoomParts(layout({ includeFloor: false, includeInteriorWalls: false })).rooms[0].parts).toEqual([]);
    expect(renderableRoomParts(layout({ includeFloor: true, includeInteriorWalls: false })).rooms[0].parts).toEqual(["floor"]);
    expect(renderableRoomParts(layout({ includeFloor: false, includeInteriorWalls: true })).rooms[0].parts).toEqual(["walls"]);
  });
});
