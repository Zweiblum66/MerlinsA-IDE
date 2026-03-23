import type { TheIdeDatabase } from "@the-ide/db";
import { ApiContractRegistry } from "./registry.js";
import { DriftDetector } from "./detector.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export function createApiRegistryServer(
  db: TheIdeDatabase,
  projectId: string,
): { tools: ToolDefinition[] } {
  const registry = new ApiContractRegistry(db, projectId);
  const detector = new DriftDetector();

  const tools: ToolDefinition[] = [
    {
      name: "api_register_endpoint",
      description:
        "Register a new API endpoint contract with its request/response schemas",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "The API endpoint path (e.g. /api/users)" },
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
            description: "HTTP method",
          },
          requestSchema: {
            type: "string",
            description: "JSON Schema string for the request body",
          },
          responseSchema: {
            type: "string",
            description: "JSON Schema string for the response body",
          },
          description: {
            type: "string",
            description: "Human-readable description of the endpoint",
          },
        },
        required: ["path", "method", "requestSchema", "responseSchema", "description"],
      },
      handler: async (args) => {
        const contract = await registry.registerEndpoint(
          args.path as string,
          args.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
          args.requestSchema as string,
          args.responseSchema as string,
          args.description as string,
        );
        return contract;
      },
    },
    {
      name: "api_get_contract",
      description: "Get an API contract by its ID",
      inputSchema: {
        type: "object",
        properties: {
          contractId: {
            type: "string",
            description: "The unique ID of the contract",
          },
        },
        required: ["contractId"],
      },
      handler: async (args) => {
        const contract = await registry.getContract(args.contractId as string);
        if (!contract) {
          return { error: `Contract ${args.contractId} not found` };
        }
        return contract;
      },
    },
    {
      name: "api_list_contracts",
      description: "List all registered API contracts for the current project",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        const contracts = await registry.listContracts();
        return { contracts, count: contracts.length };
      },
    },
    {
      name: "api_check_drift",
      description:
        "Check for schema drift between a registered contract and an actual schema",
      inputSchema: {
        type: "object",
        properties: {
          contractId: {
            type: "string",
            description: "The contract ID to check against",
          },
          schemaType: {
            type: "string",
            enum: ["request", "response"],
            description: "Whether to check the request or response schema",
          },
          actualSchema: {
            type: "string",
            description: "The actual JSON Schema string observed in code",
          },
        },
        required: ["contractId", "schemaType", "actualSchema"],
      },
      handler: async (args) => {
        const contract = await registry.getContract(args.contractId as string);
        if (!contract) {
          return { error: `Contract ${args.contractId} not found` };
        }

        const registeredRaw =
          args.schemaType === "request"
            ? contract.requestSchema
            : contract.responseSchema;

        const registered = JSON.parse(registeredRaw) as Record<string, unknown>;
        const actual = JSON.parse(args.actualSchema as string) as Record<string, unknown>;

        const report = detector.compareSchemas(registered, actual);
        return report;
      },
    },
    {
      name: "api_update_contract",
      description: "Update an existing API contract and record the changes",
      inputSchema: {
        type: "object",
        properties: {
          contractId: {
            type: "string",
            description: "The contract ID to update",
          },
          updates: {
            type: "object",
            description: "Fields to update",
            properties: {
              path: { type: "string" },
              method: {
                type: "string",
                enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
              },
              requestSchema: { type: "string" },
              responseSchema: { type: "string" },
              description: { type: "string" },
            },
          },
          changedBy: {
            type: "string",
            description: "Identifier of who made the change",
          },
        },
        required: ["contractId", "updates", "changedBy"],
      },
      handler: async (args) => {
        const updated = await registry.updateContract(
          args.contractId as string,
          args.updates as Record<string, string>,
          args.changedBy as string,
        );
        return updated;
      },
    },
    {
      name: "api_validate_call",
      description:
        "Validate an API call against its registered contract by path and method",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The API path being called",
          },
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
            description: "HTTP method of the call",
          },
        },
        required: ["path", "method"],
      },
      handler: async (args) => {
        const contract = await registry.getContractByRoute(
          args.path as string,
          args.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
        );

        if (!contract) {
          return {
            valid: false,
            error: `No contract registered for ${args.method} ${args.path}`,
          };
        }

        return {
          valid: true,
          contract,
        };
      },
    },
  ];

  return { tools };
}
