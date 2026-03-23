export interface DriftItem {
  fieldPath: string;
  changeType: "added" | "removed" | "typeChanged";
  oldType?: string;
  newType?: string;
  isBreaking: boolean;
}

export interface DriftReport {
  hasDrift: boolean;
  breakingChanges: DriftItem[];
  nonBreakingChanges: DriftItem[];
}

interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  items?: JsonSchemaObject;
  [key: string]: unknown;
}

export class DriftDetector {
  compareSchemas(registered: JsonSchemaObject, actual: JsonSchemaObject): DriftReport {
    const breakingChanges: DriftItem[] = [];
    const nonBreakingChanges: DriftItem[] = [];

    this.compareObjects(registered, actual, "", breakingChanges, nonBreakingChanges);

    return {
      hasDrift: breakingChanges.length > 0 || nonBreakingChanges.length > 0,
      breakingChanges,
      nonBreakingChanges,
    };
  }

  private compareObjects(
    registered: JsonSchemaObject,
    actual: JsonSchemaObject,
    basePath: string,
    breakingChanges: DriftItem[],
    nonBreakingChanges: DriftItem[],
  ): void {
    if (registered.type !== actual.type) {
      breakingChanges.push({
        fieldPath: basePath || "/",
        changeType: "typeChanged",
        oldType: registered.type,
        newType: actual.type,
        isBreaking: true,
      });
      return;
    }

    const registeredProps = registered.properties ?? {};
    const actualProps = actual.properties ?? {};
    const registeredRequired = new Set(registered.required ?? []);
    const actualRequired = new Set(actual.required ?? []);

    const allKeys = new Set([
      ...Object.keys(registeredProps),
      ...Object.keys(actualProps),
    ]);

    for (const key of allKeys) {
      const fieldPath = basePath ? `${basePath}.${key}` : key;
      const inRegistered = key in registeredProps;
      const inActual = key in actualProps;

      if (inRegistered && !inActual) {
        const wasRequired = registeredRequired.has(key);
        const item: DriftItem = {
          fieldPath,
          changeType: "removed",
          oldType: registeredProps[key].type,
          isBreaking: wasRequired,
        };

        if (wasRequired) {
          breakingChanges.push(item);
        } else {
          nonBreakingChanges.push(item);
        }
        continue;
      }

      if (!inRegistered && inActual) {
        const isRequired = actualRequired.has(key);
        const item: DriftItem = {
          fieldPath,
          changeType: "added",
          newType: actualProps[key].type,
          isBreaking: isRequired,
        };

        if (isRequired) {
          breakingChanges.push(item);
        } else {
          nonBreakingChanges.push(item);
        }
        continue;
      }

      if (inRegistered && inActual) {
        this.compareObjects(
          registeredProps[key],
          actualProps[key],
          fieldPath,
          breakingChanges,
          nonBreakingChanges,
        );
      }
    }

    if (registered.items && actual.items) {
      this.compareObjects(
        registered.items,
        actual.items,
        basePath ? `${basePath}.items` : "items",
        breakingChanges,
        nonBreakingChanges,
      );
    } else if (registered.items && !actual.items) {
      breakingChanges.push({
        fieldPath: basePath ? `${basePath}.items` : "items",
        changeType: "removed",
        oldType: registered.items.type,
        isBreaking: true,
      });
    } else if (!registered.items && actual.items) {
      breakingChanges.push({
        fieldPath: basePath ? `${basePath}.items` : "items",
        changeType: "added",
        newType: actual.items.type,
        isBreaking: true,
      });
    }
  }
}
