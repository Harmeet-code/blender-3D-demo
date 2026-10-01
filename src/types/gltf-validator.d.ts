declare module 'gltf-validator' {
  export function validateBytes(
    bytes: Uint8Array,
    options?: { uri?: string },
  ): Promise<{ issues: { numErrors: number; numWarnings: number } }>;
}
