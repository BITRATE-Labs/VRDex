export type HomeClubPosition = {
  clubId: string;
  index: number;
  left: number;
  width: number;
  top?: number;
  viewportWidth?: number;
  viewportHeight?: number;
};

export function readHomeClubPosition(): HomeClubPosition | undefined {
  return window.history.state?.vrdexHomeClubPosition;
}
