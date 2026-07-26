import type { FunctionManifest, FunctionInstance } from "./types";

const manifests = new Map<string, FunctionManifest>();

export { type FunctionManifest, type FunctionInstance };

export function registerFunction(manifest: FunctionManifest): void {
  manifests.set(manifest.name, manifest);
}

export function getManifest(name: string): FunctionManifest | undefined {
  return manifests.get(name);
}

export function getAllManifests(): FunctionManifest[] {
  return Array.from(manifests.values());
}

export async function createInstance(name: string, config: Record<string, unknown>): Promise<FunctionInstance> {
  const manifest = manifests.get(name);
  if (!manifest) throw new Error(`Function not found: ${name}`);
  return manifest.createInstance(config);
}

// Export as functionRegistry for backward compatibility
export const functionRegistry = {
  registerFunction,
  getManifest,
  getAllManifests,
  createInstance,
};
