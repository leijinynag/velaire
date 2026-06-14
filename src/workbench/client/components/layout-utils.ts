export interface PanelWidthBounds {
  min: number;
  max: number;
}

export function clampPanelWidth(width: number, bounds: PanelWidthBounds): number {
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(width)));
}
