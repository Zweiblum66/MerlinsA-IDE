/**
 * Shared JSON Schema definitions reused across route handlers.
 */

export const ErrorResponse = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
  required: ["error", "message"],
} as const;

export const PaginationQuery = {
  type: "object",
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
    offset: { type: "integer", minimum: 0, default: 0 },
  },
} as const;

export const IdParam = {
  type: "object",
  properties: {
    id: { type: "string" },
  },
  required: ["id"],
} as const;

export const ProjectIdParam = {
  type: "object",
  properties: {
    projectId: { type: "string" },
  },
  required: ["projectId"],
} as const;

export const SprintIdParam = {
  type: "object",
  properties: {
    sprintId: { type: "string" },
  },
  required: ["sprintId"],
} as const;
