import type { AtlasConnectionData, AtlasElementData } from "@/components/atlas/types";

export type HomePostElementData = AtlasElementData & {
  postId: string;
};

export type HomePhotoElementData = AtlasElementData & {
  type: "photo";
  postId?: null;
  imageUrl: string;
};

export type HomeSpatialElementData = HomePostElementData | HomePhotoElementData;

export type HomeBoardSnapshot = {
  boardId: string;
  elements: HomeSpatialElementData[];
  connections: AtlasConnectionData[];
};

export type HomeAnchorKind = "post" | "photo";

export type HomeAnchor = {
  id: string;
  kind: HomeAnchorKind;
  getRect: () => DOMRect | null;
};

export type HomeContextMenuState = {
  screenX: number;
  screenY: number;
  boardX: number;
  boardY: number;
};
