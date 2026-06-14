export type HomeSpatialKind = "post" | "photo";

export const HOME_PHOTO_MIN_WIDTH = 120;
export const HOME_PHOTO_MAX_WIDTH = 640;

export function clampPhotoSize({
  width,
  aspectRatio,
}: {
  width: number;
  aspectRatio: number;
}) {
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 4 / 3;
  const clampedWidth = Math.max(HOME_PHOTO_MIN_WIDTH, Math.min(HOME_PHOTO_MAX_WIDTH, Math.round(width)));

  return {
    width: clampedWidth,
    height: Math.round(clampedWidth / safeAspectRatio),
  };
}

export function getRectCenter(
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  boardRect: Pick<DOMRect, "left" | "top">
) {
  return {
    x: rect.left - boardRect.left + rect.width / 2,
    y: rect.top - boardRect.top + rect.height / 2,
  };
}

export function isConnectablePair(from: HomeSpatialKind, to: HomeSpatialKind) {
  return !(from === "post" && to === "post");
}

export function isHomeBlankTarget(target: HTMLElement) {
  return !target.closest(
    [
      "a",
      "button",
      "input",
      "textarea",
      "select",
      "[contenteditable='true']",
      "[data-home-post-card]",
      "[data-home-photo]",
      "[data-home-context-menu]",
      "[data-caption-area]",
    ].join(",")
  );
}
