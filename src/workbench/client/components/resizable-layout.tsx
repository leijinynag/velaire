import { useCallback, useEffect, useMemo, useState } from "react";

import { clampPanelWidth, type PanelWidthBounds } from "./layout-utils";

const DRAWER_BOUNDS: PanelWidthBounds = { min: 220, max: 420 };
const INSPECTOR_BOUNDS: PanelWidthBounds = { min: 300, max: 560 };
const LS_DRAWER_WIDTH = "velaire-workbench-drawer-width";
const LS_INSPECTOR_WIDTH = "velaire-workbench-inspector-width";

function storedWidth(key: string, fallback: number, bounds: PanelWidthBounds): number {
  if (typeof window === "undefined") return fallback;
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? clampPanelWidth(value, bounds) : fallback;
}

function persistWidth(key: string, width: number) {
  try {
    window.localStorage.setItem(key, String(width));
  } catch {
    // Ignore storage failures; resizing should still work for this session.
  }
}

export function ResizableWorkbenchLayout({
  rail,
  drawer,
  canvas,
  inspector,
}: {
  rail: React.ReactNode;
  drawer: React.ReactNode;
  canvas: React.ReactNode;
  inspector: React.ReactNode;
}) {
  const [drawerWidth, setDrawerWidth] = useState(() => storedWidth(LS_DRAWER_WIDTH, 260, DRAWER_BOUNDS));
  const [inspectorWidth, setInspectorWidth] = useState(() => storedWidth(LS_INSPECTOR_WIDTH, 360, INSPECTOR_BOUNDS));
  const [dragging, setDragging] = useState<"drawer" | "inspector" | null>(null);

  const beginDrawerDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging("drawer");
  }, []);

  const beginInspectorDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging("inspector");
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (event: PointerEvent) => {
      if (dragging === "drawer") {
        const next = clampPanelWidth(event.clientX - 54, DRAWER_BOUNDS);
        setDrawerWidth(next);
        persistWidth(LS_DRAWER_WIDTH, next);
      } else {
        const next = clampPanelWidth(window.innerWidth - event.clientX, INSPECTOR_BOUNDS);
        setInspectorWidth(next);
        persistWidth(LS_INSPECTOR_WIDTH, next);
      }
    };
    const handleEnd = () => setDragging(null);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd, { once: true });
    document.body.classList.add("is-resizing-panels");

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      document.body.classList.remove("is-resizing-panels");
    };
  }, [dragging]);

  const style = useMemo(() => ({
    "--drawer-width": `${drawerWidth}px`,
    "--inspector-width": `${inspectorWidth}px`,
  }) as React.CSSProperties, [drawerWidth, inspectorWidth]);

  return (
    <div className={`wb-layout${dragging ? ` resizing-${dragging}` : ""}`} style={style}>
      {rail}
      {drawer}
      {drawer && <ResizeHandle side="drawer" active={dragging === "drawer"} onPointerDown={beginDrawerDrag} />}
      {canvas}
      <ResizeHandle side="inspector" active={dragging === "inspector"} onPointerDown={beginInspectorDrag} />
      {inspector}
    </div>
  );
}

function ResizeHandle({
  side,
  active,
  onPointerDown,
}: {
  side: "drawer" | "inspector";
  active: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={`resize-handle ${side}${active ? " active" : ""}`}
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize panel"
      onPointerDown={onPointerDown}
    />
  );
}
