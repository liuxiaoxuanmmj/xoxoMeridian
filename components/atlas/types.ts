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

export type AtlasBoardSnapshot = {
  boardId: string;
  elements: AtlasElementData[];
  connections: AtlasConnectionData[];
};

export type OptimisticOp =
  | { type: "add"; id: string; element: AtlasElementData; ts: number }
  | { type: "update"; id: string; patch: Partial<AtlasElementData>; ts: number }
  | { type: "delete"; id: string; ts: number }
  | { type: "drag"; id: string; x: number; y: number; ts: number }
  | { type: "addConn"; id: string; connection: AtlasConnectionData; ts: number }
  | { type: "deleteConn"; id: string; ts: number };
