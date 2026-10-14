import type { MallBufferField, MallEncodedBuffer } from './mall-types.ts';

interface TypedArrayConstructor<T> {
  new (length: number): T;
  new (buffer: ArrayBuffer): T;
  BYTES_PER_ELEMENT: number;
}

function decodeBase64(buffer: MallEncodedBuffer): Uint8Array {
  const decode = globalThis.atob;
  if (typeof decode !== 'function') {
    throw new Error('This browser cannot decode the procedural mall geometry buffers.');
  }
  const binary = decode(buffer.data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function copyTyped<T extends Float32Array | Uint16Array | Uint32Array>(
  bytes: Uint8Array,
  length: number,
  Constructor: TypedArrayConstructor<T>,
): T {
  if (bytes.byteLength !== length * Constructor.BYTES_PER_ELEMENT) {
    throw new Error('A procedural mall geometry buffer has an invalid byte length.');
  }
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return new Constructor(bytes.buffer as ArrayBuffer);
  }
  return new Constructor(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
}

export function decodeFloat32Buffer(value: MallBufferField): Float32Array {
  if (Array.isArray(value)) {
    return new Float32Array(value);
  }
  if (value.encoding !== 'f32-base64') {
    throw new Error(`Expected f32-base64 geometry data, received ${value.encoding}.`);
  }
  return copyTyped(decodeBase64(value), value.length, Float32Array);
}

export function decodeIndexBuffer(value: MallBufferField): Uint16Array | Uint32Array {
  if (Array.isArray(value)) {
    let maximum = 0;
    for (const index of value) {
      maximum = Math.max(maximum, index);
    }
    return maximum > 65535 ? new Uint32Array(value) : new Uint16Array(value);
  }
  if (value.encoding === 'u16-base64') {
    return copyTyped(decodeBase64(value), value.length, Uint16Array);
  }
  if (value.encoding === 'u32-base64') {
    return copyTyped(decodeBase64(value), value.length, Uint32Array);
  }
  throw new Error(`Expected an unsigned index buffer, received ${value.encoding}.`);
}
