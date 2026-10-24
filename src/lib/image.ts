// Shrinks a chosen photo to a 256 px square JPEG in the browser (enough for the largest
// 72 px avatar on a 3x screen, at ~15 KB), so uploads and downloads stay small
// and any metadata in the original file (like GPS) is dropped.

const SIZE = 256;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

export async function squarePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image. Pick a JPG, PNG or similar photo.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That photo is too large. Pick one under 15 MB.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't read that photo. Try a JPG or PNG.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Your browser couldn't process that photo.");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that photo."))), 'image/jpeg', 0.82),
  );
}
