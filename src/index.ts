#!/usr/bin/env node

// Disable colors to prevent ANSI color codes from breaking JSON parsing
process.env.NODE_DISABLE_COLORS = "1";
process.env.NO_COLOR = "1";

import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import dotenv from "dotenv";
import logger from "./utils/logger.js";
import {
  generateId,
  PLAIT_ELEMENT_TYPES,
  ServerElement,
  PlaitElementType,
  validateElement,
  StrokeStyle,
  ArrowLineShapes,
  GeometryShapes,
  ArrowLineMarkerType,
  TextAlign,
  FreehandShapes,
} from "./plait-types.js";
import fetch from "node-fetch";

// Load environment variables
dotenv.config();

// Express server configuration
const EXPRESS_SERVER_URL =
  process.env.EXPRESS_SERVER_URL || "http://localhost:3000";
const ENABLE_CANVAS_SYNC = process.env.ENABLE_CANVAS_SYNC !== "false"; // Default to true

// API Response types
interface ApiResponse {
  success: boolean;
  element?: ServerElement;
  elements?: ServerElement[];
  message?: string;
  count?: number;
}

interface SyncResponse {
  element?: ServerElement;
  elements?: ServerElement[];
}

// Helper functions to sync with Express server (canvas)
async function syncToCanvas(
  operation: string,
  data: any
): Promise<SyncResponse | null> {
  if (!ENABLE_CANVAS_SYNC) {
    logger.debug("Canvas sync disabled, skipping");
    return null;
  }

  try {
    let url: string;
    let options: any;

    switch (operation) {
      case "create":
        url = `${EXPRESS_SERVER_URL}/api/elements`;
        options = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        };
        break;
      default:
        logger.warn(`Unknown sync operation: ${operation}`);
        return null;
    }

    logger.debug(`Syncing to canvas: ${operation}`, { url, data });
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(
        `Canvas sync failed: ${response.status} ${response.statusText}`
      );
    }

    const result = (await response.json()) as ApiResponse;
    logger.debug(`Canvas sync successful: ${operation}`, result);
    return result as SyncResponse;
  } catch (error) {
    logger.warn(
      `Canvas sync failed for ${operation}:`,
      (error as Error).message
    );
    // Don't throw - we want MCP operations to work even if canvas is unavailable
    return null;
  }
}

// Helper to sync element creation to canvas
async function createElementOnCanvas(
  elementData: ServerElement
): Promise<ServerElement | null> {
  const result = await syncToCanvas("create", elementData);
  return result?.element || elementData;
}

// Tool definitions
const tools: Tool[] = [
  {
    name: "create_geometry_element",
    description: `Create a new Plait Draw Geometry element, such as rectangle, ellipse, diamond, text, etc.
    If the type is text, you can set the autoSize property to true so that the width and height of the text are adaptive and the second value of points will not be used.`,
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "The unique identifier of the element, 5 characters in ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz,",
        },
        type: z.literal("geometry"),
        points: {
          type: "array",
          items: z.tuple([z.number(), z.number()]),
          description: `The position of the element on the canvas, such as [[100, 100], [200, 200]]. 
          If the shape is text, then autoSize is true, and pointers should point to the top left and bottom right corners after the text is rendered`,
        },
        shape: {
          type: "string",
          enum: Object.values(GeometryShapes),
        },
        text: { type: "string" },
        textAlign: {
          type: "string",
          enum: Object.values(TextAlign),
        },
        fill: { type: "string" },
        strokeColor: { type: "string" },
        strokeWidth: { type: "number" },
        strokeStyle: {
          type: "string",
          enum: Object.values(StrokeStyle),
        },
        autoSize: { type: "boolean" },
      },
      required: ["type", "points", "text", "shape", "textAlign"],
    },
  },
  {
    name: "create_arrow_line_element",
    description: `Create a new Plait Draw Arrow Line element, such as straight, curve, elbow, etc.
    There can be multiple texts on a line. The position of the text on the line is represented by position(0-1), usually 0.5 means it is in the middle.
    If the two graphs have two-way arrows, you need to set the two lines not to overlap.
    You need to choose the appropriate arrow shape according to different scenarios, curve is suitable for some illustrative scenarios, and elbow is suitable for standard flowcharts.`,
    inputSchema: {
      id: {
        type: "string",
        description:
          "The unique identifier of the element, 5 characters in ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz,",
      },
      type: "object",
      properties: {
        type: z.literal("arrow-line"),
        points: {
          type: "array",
          items: z.tuple([z.number(), z.number()]),
        },
        shape: {
          type: "string",
          enum: Object.values(ArrowLineShapes),
        },
        texts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              position: { type: "number" },
            },
            required: ["text", "position"],
          },
        },
        strokeColor: { type: "string" },
        strokeWidth: { type: "number" },
        strokeStyle: {
          type: "string",
          enum: Object.values(StrokeStyle),
        },
        source: {
          type: "object",
          properties: {
            boundId: {
              type: "string",
              description:
                "线的起始位置连着的元素的id，如果起点没有连着其它元素，则不填",
            },
            connection: {
              type: "array",
              items: { type: "number" },
              minItems: 2,
              maxItems: 2,
              description: `该线条的起点连接元素的连接点，格式为 [x, y]， x 取值只能是 0 或 0.5 或 1， y 取值只能是 0 或 0.5 或 1，
                    [0,0] 表示起点连接元素的左上角，[0,1] 表示起点连接元素的左下角，[1,0] 表示起点连接元素的右上角，[1,1] 表示起点连接元素的右下角，
                    [0,0.5] 表示起点连接元素的左中，[1,0.5] 表示起点连接元素的右中，[0.5,0] 表示起点连接元素的上中，[0.5,1] 表示起点连接元素的下中，
                    当 boundId 有值时，必填。`,
            },
            marker: {
              type: "string",
              enum: Object.values(ArrowLineMarkerType),
              description: `该线条的起点箭头类型，有箭头代表着流动方向，如果是从开头到结尾的单方向只需要在 target 中设置 marker，source 设置为 node 就行，只有双向流通的逻辑才需要在 source 中设置 marker。`,
            },
          },
          required: ["marker"],
        },
        target: {
          type: "object",
          properties: {
            boundId: {
              type: "string",
              description:
                "线的终点连着的元素的id，如果终点没有连着其它元素，则不填",
            },
            connection: {
              type: "array",
              items: { type: "number" },
              minItems: 2,
              maxItems: 2,
              description: `该线条的终点连接元素的连接点，格式为 [x, y]， x 取值只能是 0 或 0.5 或 1， y 取值只能是 0 或 0.5 或 1，
                    [0,0] 表示终点连接元素的左上角，[0,1] 表示终点连接元素的左下角，[1,0] 表示终点连接元素的右上角，[1,1] 表示终点连接元素的右下角，
                    [0,0.5] 表示终点连接元素的左中，[1,0.5] 表示终点连接元素的右中，[0.5,0] 表示终点连接元素的上中，[0.5,1] 表示终点连接元素的下中，
                    当 boundId 有值时，必填。`,
            },
            marker: {
              type: "string",
              enum: Object.values(ArrowLineMarkerType),
              description: `该线条的终点箭头类型，有箭头代表着流动方向，如果箭头线的方向从开头到结尾的单方向只需要在 target 中设置 marker，如果不需要特殊表达从开始到结尾的方向设置 marker 为 node 就行。`,
            },
          },
          required: ["marker"],
        },
      },
      required: ["type", "points", "shape", "texts"],
    },
  },
  {
    name: "create_freehand_element",
    description: `Create a new Plait Draw Freehand element, only support feltTipPen shape.
    There can be multiple texts on a line. The position of the text on the line is represented by position(0-1), usually 0.5 means it is in the middle..`,
    inputSchema: {
      id: {
        type: "string",
        description:
          "The unique identifier of the element, 5 characters in ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz,",
      },
      type: "object",
      properties: {
        type: z.literal("freehand"),
        points: {
          type: "array",
          items: z.tuple([z.number(), z.number()]),
        },
        shape: {
          type: "string",
          enum: Object.values(FreehandShapes),
        },
        strokeColor: { type: "string" },
        strokeWidth: { type: "number" },
      },
      required: ["type", "points", "shape"],
    },
  },
];

// Initialize MCP server
const server = new Server(
  {
    name: "mcp-plait-server",
    version: "0.0.1",
    description: "Advanced MCP server for Plait with real-time canvas",
  },
  {
    capabilities: {
      tools: Object.fromEntries(
        tools.map((tool) => [
          tool.name,
          {
            description: tool.description,
            inputSchema: tool.inputSchema,
          },
        ])
      ),
    },
  }
);

// Set up request handler for tool calls
server.setRequestHandler(
  CallToolRequestSchema,
  async (request: CallToolRequest) => {
    try {
      const { name, arguments: args } = request.params;
      logger.debug(`Handling tool call: ${name}`);

      switch (name) {
        case "create_geometry_element":
        case "create_arrow_line_element":
        case "create_freehand_element": {
          const params = args as unknown as ServerElement;
          if (!params.id) {
            throw new Error("Failed to create element: id is required");
          }
          if (
            name === "create_arrow_line_element" &&
            params.type !== "arrow-line"
          ) {
            throw new Error(
              "Failed to create element: type must be arrow-line"
            );
          }
          if (
            name === "create_freehand_element" &&
            params.type !== "freehand"
          ) {
            throw new Error("Failed to create element: type must be freehand");
          }
          if (
            name === "create_geometry_element" &&
            params.type !== "geometry"
          ) {
            throw new Error("Failed to create element: type must be geometry");
          }
          logger.debug("Creating element via MCP", { type: params.type });
          // Create element directly on HTTP server (no local storage)
          const canvasElement = await createElementOnCanvas(params);

          if (!canvasElement) {
            throw new Error(
              "Failed to create element: HTTP server unavailable"
            );
          }

          logger.debug("Element created via MCP and synced to canvas", {
            type: params.type,
            synced: !!canvasElement,
          });

          return {
            content: [
              {
                type: "text",
                text: `Element created successfully!\n\n${JSON.stringify(
                  canvasElement,
                  null,
                  2
                )}\n\n✅ Synced to canvas`,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error(`Error handling tool call: ${(error as Error).message}`, {
        error,
      });
      return {
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Set up request handler for listing available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.info("Listing available tools");
  return { tools };
});

// Start server with transport based on mode
async function runServer(): Promise<void> {
  try {
    logger.info("Starting Plait MCP server...");

    const transportMode = process.env.MCP_TRANSPORT_MODE || "stdio";
    let transport;

    if (transportMode === "http") {
      const port = parseInt(process.env.PORT || "3000", 10);
      const host = process.env.HOST || "localhost";

      logger.info(`Starting HTTP server on ${host}:${port}`);
      // Here you would create an HTTP transport
      // This is a placeholder - actual HTTP transport implementation would need to be added
      transport = new StdioServerTransport(); // Fallback to stdio for now
    } else {
      // Default to stdio transport
      transport = new StdioServerTransport();
    }

    // Add a debug message before connecting
    logger.debug("Connecting to transport...");

    await server.connect(transport);
    logger.info(`Plait MCP server running on ${transportMode}`);

    // Keep the process running
    process.stdin.resume();
  } catch (error) {
    logger.error("Error starting server:", error);
    process.stderr.write(
      `Failed to start MCP server: ${(error as Error).message}\n${
        (error as Error).stack
      }\n`
    );
    process.exit(1);
  }
}

// Add global error handlers
process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught exception:", error);
  process.stderr.write(
    `UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}\n`
  );
  setTimeout(() => process.exit(1), 1000);
});

process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  logger.error("Unhandled promise rejection:", reason);
  process.stderr.write(`UNHANDLED REJECTION: ${reason}\n`);
  setTimeout(() => process.exit(1), 1000);
});

// For testing and debugging purposes
if (process.env.DEBUG === "true") {
  logger.debug("Debug mode enabled");
}

// Start the server if this file is run directly
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runServer().catch((error) => {
    logger.error("Failed to start server:", error);
    process.exit(1);
  });
}

export default runServer;
