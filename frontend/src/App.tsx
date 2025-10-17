import React, { useState, useEffect, useRef } from "react";
import DrawnixWrapper from "./DrawnixWrapper";
import { idCreator, PlaitBoard, PlaitElement, Transforms } from "@plait/core";
import { buildText } from "@plait/common";
import { PlaitGeometry, PlaitArrowLine } from "@plait/draw";

// Type definitions
interface ServerElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  backgroundColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  roughness?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string | number;
  label?: {
    text: string;
  };
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  syncedAt?: string;
  source?: string;
  syncTimestamp?: string;
  boundElements?: any[] | null;
  containerId?: string | null;
  locked?: boolean;
}

interface WebSocketMessage {
  type: string;
  element?: ServerElement;
  elements?: ServerElement[];
  elementId?: string;
  count?: number;
  timestamp?: string;
  source?: string;
}

interface ApiResponse {
  success: boolean;
  elements?: ServerElement[];
  element?: ServerElement;
  count?: number;
  error?: string;
  message?: string;
}

interface ElementBinding {
  id: string;
  type: "text" | "arrow";
}

type SyncStatus = "idle" | "syncing" | "success" | "error";

// Helper function to clean elements for Plait
const cleanElementForPlait = (
  element: ServerElement
): Partial<PlaitElement> => {
  const {
    createdAt,
    updatedAt,
    version,
    syncedAt,
    source,
    syncTimestamp,
    ...cleanElement
  } = element;
  return cleanElement;
};

// Helper function to validate and fix element binding data
const validateAndFixBindings = (
  elements: Partial<PlaitElement>[]
): Partial<PlaitElement>[] => {
  const elementMap = new Map(elements.map((el) => [el.id!, el]));

  return elements.map((element) => {
    const fixedElement = { ...element };

    // Validate and fix boundElements
    if (fixedElement.boundElements) {
      if (Array.isArray(fixedElement.boundElements)) {
        fixedElement.boundElements = fixedElement.boundElements.filter(
          (binding: any) => {
            // Ensure binding has required properties
            if (!binding || typeof binding !== "object") return false;
            if (!binding.id || !binding.type) return false;

            // Ensure the referenced element exists
            const referencedElement = elementMap.get(binding.id);
            if (!referencedElement) return false;

            // Validate binding type
            if (!["text", "arrow"].includes(binding.type)) return false;

            return true;
          }
        );

        // Remove boundElements if empty
        if (fixedElement.boundElements.length === 0) {
          fixedElement.boundElements = null;
        }
      } else {
        // Invalid boundElements format, set to null
        fixedElement.boundElements = null;
      }
    }

    // Validate and fix containerId
    if (fixedElement.containerId) {
      const containerElement = elementMap.get(fixedElement.containerId);
      if (!containerElement) {
        // Container doesn't exist, remove containerId
        fixedElement.containerId = null;
      }
    }

    return fixedElement;
  });
};

const convertPlaitElement = (
  element: PlaitElement
): PlaitGeometry | PlaitArrowLine | undefined => {
  if (element.type === "geometry") {
    return {
      ...element,
      id: idCreator(),
      text: buildText(element.text || "", element.textAlign || 'center'),
    } as PlaitGeometry;
  } else if (element.type === "arrow-line") {
    return {
      ...element,
      id: idCreator(),
      texts: element.texts?.map((arrowLine: any) => ({
        ...arrowLine,
        text: buildText(arrowLine.text || ""),
      })),
    } as PlaitArrowLine;
  }
};

function App(): JSX.Element {
  const boardRef = useRef<PlaitBoard | null>(null);
  const [elements, setElements] = useState<PlaitElement[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const websocketRef = useRef<WebSocket | null>(null);

  // Sync state management
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // WebSocket connection
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (websocketRef.current) {
        websocketRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = (): void => {
    if (
      websocketRef.current &&
      websocketRef.current.readyState === WebSocket.OPEN
    ) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;

    websocketRef.current = new WebSocket(wsUrl);

    websocketRef.current.onopen = () => {
      setIsConnected(true);
    };

    websocketRef.current.onmessage = (event: MessageEvent) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error, event.data);
      }
    };

    websocketRef.current.onclose = (event: CloseEvent) => {
      setIsConnected(false);

      // Reconnect after 3 seconds if not a clean close
      if (event.code !== 1000) {
        setTimeout(connectWebSocket, 3000);
      }
    };

    websocketRef.current.onerror = (error: Event) => {
      console.error("WebSocket error:", error);
      setIsConnected(false);
    };
  };

  const handleWebSocketMessage = (data: WebSocketMessage): void => {
    try {
      switch (data.type) {
        case "element_created":
          if (data.element) {
            console.log(data.element);
          }
          const element = convertPlaitElement(data.element as PlaitElement);
          const elements = boardRef.current!.children;
          Transforms.insertNode(boardRef.current!, element as PlaitElement, [
            elements.length,
          ]);
          console.log(element, "convertPlaitElement");
          break;
        case "elements_synced":
          console.log(`Sync confirmed by server: ${data.count} elements`);
          // Sync confirmation already handled by HTTP response
          break;

        case "sync_status":
          console.log(`Server sync status: ${data.count} elements`);
          break;

        default:
          console.log("Unknown WebSocket message type:", data.type);
      }
    } catch (error) {
      console.error("Error processing WebSocket message:", error, data);
    }
  };

  // Data format conversion for backend
  const convertToBackendFormat = (element: PlaitElement): ServerElement => {
    return {
      ...element,
    } as ServerElement;
  };

  // Format sync time display
  const formatSyncTime = (time: Date | null): string => {
    if (!time) return "";
    return time.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Main sync function
  const syncToBackend = async (): Promise<void> => {
    setSyncStatus("syncing");

    try {
      // 1. Get current elements
      console.log(`Syncing ${elements.length} elements to backend`);

      // 2. Filter out deleted elements
      const activeElements = elements.filter((el) => !el.isDeleted);

      // 3. Convert to backend format
      const backendElements = activeElements.map(convertToBackendFormat);

      // 4. Send to backend
      const response = await fetch("/api/elements/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          elements: backendElements,
          timestamp: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        const result: ApiResponse = await response.json();
        setSyncStatus("success");
        setLastSyncTime(new Date());
        console.log(`Sync successful: ${result.count} elements synced`);

        // Reset status after 2 seconds
        setTimeout(() => setSyncStatus("idle"), 2000);
      } else {
        const error: ApiResponse = await response.json();
        setSyncStatus("error");
        console.error("Sync failed:", error.error);
      }
    } catch (error) {
      setSyncStatus("error");
      console.error("Sync error:", error);
    }
  };

  const clearCanvas = async (): Promise<void> => {
    try {
      // Get all current elements and delete them from backend
      const response = await fetch("/api/elements");
      const result: ApiResponse = await response.json();

      if (result.success && result.elements) {
        const deletePromises = result.elements.map((element) =>
          fetch(`/api/elements/${element.id}`, { method: "DELETE" })
        );
        await Promise.all(deletePromises);
      }

      // Clear the frontend canvas
    } catch (error) {
      console.error("Error clearing canvas:", error);
      // Still clear frontend even if backend fails
    }
  };

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <h1>Plait Canvas</h1>
        <div className="controls">
          <div className="status">
            <div
              className={`status-dot ${
                isConnected ? "status-connected" : "status-disconnected"
              }`}
            ></div>
            <span>{isConnected ? "Connected" : "Disconnected"}</span>
          </div>

          {/* Sync Controls */}
          <div className="sync-controls">
            <button
              className={`btn-primary ${
                syncStatus === "syncing" ? "btn-loading" : ""
              }`}
              onClick={syncToBackend}
              disabled={syncStatus === "syncing"}
            >
              {syncStatus === "syncing" && <span className="spinner"></span>}
              {syncStatus === "syncing" ? "Syncing..." : "Sync to Backend"}
            </button>

            {/* Sync Status */}
            <div className="sync-status">
              {syncStatus === "success" && (
                <span className="sync-success">✅ Synced</span>
              )}
              {syncStatus === "error" && (
                <span className="sync-error">❌ Sync Failed</span>
              )}
              {lastSyncTime && syncStatus === "idle" && (
                <span className="sync-time">
                  Last sync: {formatSyncTime(lastSyncTime)}
                </span>
              )}
            </div>
          </div>

          <button className="btn-secondary" onClick={clearCanvas}>
            Clear Canvas
          </button>
        </div>
      </div>

      {/* Canvas Container */}
      <div className="canvas-container">
        <DrawnixWrapper
          elements={elements}
          afterInit={(board: PlaitBoard) => {
            boardRef.current = board;
          }}
        />
      </div>
    </div>
  );
}

export default App;
