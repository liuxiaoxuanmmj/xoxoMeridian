export type AtlasElementData = {
  id: string;
  type: "photo" | "note";
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
  content: string | null;
  imageUrl: string | null;
  caption: string | null;
  width: number;
  height: number;
  createdById: string | null;
  createdAt: string;
};

export type AtlasConnectionData = {
  id: string;
  fromId: string;
  toId: string;
  color: string;
};
