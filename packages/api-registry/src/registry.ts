import { eq, and, gte } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { apiContracts, apiChanges } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";

export type ApiContract = typeof apiContracts.$inferSelect;
export type ApiChange = typeof apiChanges.$inferSelect;

export interface ContractUpdates {
  path?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  requestSchema?: string;
  responseSchema?: string;
  description?: string;
}

export class ApiContractRegistry {
  constructor(
    private readonly db: TheIdeDatabase,
    private readonly projectId: string,
  ) {}

  async registerEndpoint(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    requestSchema: string,
    responseSchema: string,
    description: string,
  ): Promise<ApiContract> {
    const id = uuidv4();
    const now = new Date();

    await this.db.insert(apiContracts).values({
      id,
      projectId: this.projectId,
      path,
      method,
      requestSchema,
      responseSchema,
      description,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    const result = await this.db
      .select()
      .from(apiContracts)
      .where(eq(apiContracts.id, id));

    return result[0];
  }

  async getContract(contractId: string): Promise<ApiContract | null> {
    const result = await this.db
      .select()
      .from(apiContracts)
      .where(eq(apiContracts.id, contractId));

    return result[0] ?? null;
  }

  async getContractByRoute(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  ): Promise<ApiContract | null> {
    const result = await this.db
      .select()
      .from(apiContracts)
      .where(
        and(
          eq(apiContracts.projectId, this.projectId),
          eq(apiContracts.path, path),
          eq(apiContracts.method, method),
        ),
      );

    return result[0] ?? null;
  }

  async listContracts(): Promise<ApiContract[]> {
    return this.db
      .select()
      .from(apiContracts)
      .where(eq(apiContracts.projectId, this.projectId));
  }

  async updateContract(
    contractId: string,
    updates: ContractUpdates,
    changedBy: string,
  ): Promise<ApiContract> {
    const existing = await this.getContract(contractId);
    if (!existing) {
      throw new Error(`Contract ${contractId} not found`);
    }

    const changes: Array<{
      fieldPath: string;
      changeType: "ADDED" | "MODIFIED" | "REMOVED";
      oldValue: string | null;
      newValue: string | null;
      isBreaking: boolean;
    }> = [];

    if (updates.path !== undefined && updates.path !== existing.path) {
      changes.push({
        fieldPath: "path",
        changeType: "MODIFIED",
        oldValue: existing.path,
        newValue: updates.path,
        isBreaking: true,
      });
    }

    if (updates.method !== undefined && updates.method !== existing.method) {
      changes.push({
        fieldPath: "method",
        changeType: "MODIFIED",
        oldValue: existing.method,
        newValue: updates.method,
        isBreaking: true,
      });
    }

    if (
      updates.requestSchema !== undefined &&
      updates.requestSchema !== existing.requestSchema
    ) {
      changes.push({
        fieldPath: "requestSchema",
        changeType: "MODIFIED",
        oldValue: existing.requestSchema,
        newValue: updates.requestSchema,
        isBreaking: true,
      });
    }

    if (
      updates.responseSchema !== undefined &&
      updates.responseSchema !== existing.responseSchema
    ) {
      changes.push({
        fieldPath: "responseSchema",
        changeType: "MODIFIED",
        oldValue: existing.responseSchema,
        newValue: updates.responseSchema,
        isBreaking: true,
      });
    }

    if (
      updates.description !== undefined &&
      updates.description !== existing.description
    ) {
      changes.push({
        fieldPath: "description",
        changeType: "MODIFIED",
        oldValue: existing.description,
        newValue: updates.description,
        isBreaking: false,
      });
    }

    const now = new Date();

    for (const change of changes) {
      await this.db.insert(apiChanges).values({
        id: uuidv4(),
        contractId,
        changeType: change.changeType,
        fieldPath: change.fieldPath,
        oldValue: change.oldValue,
        newValue: change.newValue,
        changedBy,
        isBreaking: change.isBreaking,
        changedAt: now,
      });
    }

    await this.db
      .update(apiContracts)
      .set({
        ...updates,
        version: existing.version + 1,
        updatedAt: now,
      })
      .where(eq(apiContracts.id, contractId));

    const result = await this.db
      .select()
      .from(apiContracts)
      .where(eq(apiContracts.id, contractId));

    return result[0];
  }

  async deleteContract(contractId: string): Promise<void> {
    await this.db
      .delete(apiChanges)
      .where(eq(apiChanges.contractId, contractId));

    await this.db
      .delete(apiContracts)
      .where(eq(apiContracts.id, contractId));
  }

  async getChanges(contractId: string): Promise<ApiChange[]> {
    return this.db
      .select()
      .from(apiChanges)
      .where(eq(apiChanges.contractId, contractId));
  }

  async getBreakingChanges(since?: Date): Promise<ApiChange[]> {
    const conditions = [eq(apiChanges.isBreaking, true)];

    if (since) {
      conditions.push(gte(apiChanges.changedAt, since));
    }

    return this.db
      .select()
      .from(apiChanges)
      .where(and(...conditions));
  }
}
