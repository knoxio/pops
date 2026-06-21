/**
 * Shared upload helpers used by both photo and document upload flows.
 *
 * The browser's `FileReader.readAsDataURL` is convenient but appends a
 * `data:...;base64,` prefix that has to be stripped, so we hand-encode the
 * raw bytes ourselves.
 */

/**
 * Encode the contents of a Blob (or File) as a base64 string suitable for
 * sending through the tRPC `fileBase64` field. Chunks the conversion to
 * avoid blowing the call-stack on large files.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}
