export type Point = [number, number];

export enum StrokeStyle {
  solid = "solid",
  dashed = "dashed",
  dotted = "dotted",
}

export enum TextAlign {
  left = "left",
  center = "center",
  right = "right",
}

export enum ArrowLineShapes {
  straight = "straight",
  curve = "curve",
  elbow = "elbow",
}

export enum FreehandShapes {
  feltTipPen = "feltTipPen"
}

export enum GeometryShapes {
  rectangle = "rectangle",
  ellipse = "ellipse",
  diamond = "diamond",
  text = "text",
}

export interface ArrowLineText {
  text: string;
  position: number;
}

/**
 * [x, y] x,y between 0 and 1
 * represents a point in the rectangle
 */
export type PointOfRectangle = [number, number];

export enum ArrowLineMarkerType {
  arrow = "arrow",
  none = "none",
  openTriangle = "open-triangle",
  solidTriangle = "solid-triangle",
  sharpArrow = "sharp-arrow",
  oneSideUp = "one-side-up",
  oneSideDown = "one-side-down",
  hollowTriangle = "hollow-triangle",
  singleSlash = "single-slash",
}

export interface ArrowLineHandle {
  // The id of the bounded element
  boundId?: string;
  connection?: PointOfRectangle;
  marker: ArrowLineMarkerType;
}

export interface PlaitDrawElementBase {
  id: "geometry" | "arrow-line";
  shape: GeometryShapes | ArrowLineShapes;
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
}

export interface PlaitDrawGeometryElement {
  id: "geometry";
  fill?: string;
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  points: [Point, Point];
  shape: GeometryShapes;
  text?: string;
  autoSize?: boolean;
}

export interface PlaitDrawArrowLineElement {
  id: "arrow-line";
  shape: ArrowLineShapes;
  points: Point[];
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  texts: ArrowLineText[];
  source: ArrowLineHandle;
  target: ArrowLineHandle;
}

export type PlaitDrawElement =
  | PlaitDrawGeometryElement
  | PlaitDrawArrowLineElement;

export type PlaitElementType = "geometry" | "arrow-line" | "freehand";

export const PLAIT_ELEMENT_TYPES: Record<string, PlaitElementType> = {
  GEOMETRY: "geometry",
  ARROW_LINE: "arrow-line",
  FREEHAND: "freehand",
} as const;

export interface ServerElement extends Omit<PlaitDrawElementBase, "id"> {
  id: string;
  type: PlaitElementType;
  shape: GeometryShapes | ArrowLineShapes;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ElementsResponse extends ApiResponse {
  elements: ServerElement[];
  count: number;
}

export interface ElementResponse extends ApiResponse {
  element: ServerElement;
}

export interface SyncResponse extends ApiResponse {
  count: number;
  syncedAt: string;
  beforeCount: number;
  afterCount: number;
}

// WebSocket message types
export interface WebSocketMessage {
  type: WebSocketMessageType;
  [key: string]: any;
}

export type WebSocketMessageType =
  | "initial_elements"
  | "element_created"
  | "elements_synced"
  | "sync_status";

export interface InitialElementsMessage extends WebSocketMessage {
  type: "initial_elements";
  elements: ServerElement[];
}

export interface ElementCreatedMessage extends WebSocketMessage {
  type: "element_created";
  element: ServerElement;
}

export interface SyncStatusMessage extends WebSocketMessage {
  type: "sync_status";
  elementCount: number;
  timestamp: string;
}

// In-memory storage for Plait elements
export const elements = new Map<string, ServerElement>();

// Validation function for Plait elements
export function validateElement(
  element: Partial<ServerElement>
): element is ServerElement {
  const requiredFields: (keyof ServerElement)[] = ["type", "shape"];
  const hasRequiredFields = requiredFields.every((field) => field in element);

  if (!hasRequiredFields) {
    throw new Error(`Missing required fields: ${requiredFields.join(", ")}`);
  }

  if (
    !Object.values(PLAIT_ELEMENT_TYPES).includes(
      element.type as PlaitElementType
    )
  ) {
    throw new Error(`Invalid element type: ${element.type}`);
  }

  return true;
}

// Helper function to generate unique IDs
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
