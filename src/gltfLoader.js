/**
 * Shared GLTFLoader with MeshoptDecoder for compressed sandbox props.
 */

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

let _decoderReady = null;

export async function ensureMeshoptDecoder() {
  if (!_decoderReady) _decoderReady = MeshoptDecoder.ready;
  await _decoderReady;
  return MeshoptDecoder;
}

/** @returns {GLTFLoader} */
export async function createGLTFLoader() {
  const decoder = await ensureMeshoptDecoder();
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(decoder);
  return loader;
}

/** Wire meshopt into an existing loader instance. */
export async function configureGLTFLoader(loader) {
  const decoder = await ensureMeshoptDecoder();
  loader.setMeshoptDecoder(decoder);
  return loader;
}