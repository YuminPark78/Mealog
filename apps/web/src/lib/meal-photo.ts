const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function prepareMealPhoto(file: File): Promise<Blob> {
  if (!TYPES.has(file.type)) throw new Error("Choose a JPEG, PNG or WebP photo. For HEIC, export a JPEG or enter the meal manually.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose a photo smaller than 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = document.createElement("img");
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare this photo. Try another or enter manually.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("Could not prepare this photo.")), "image/jpeg", 0.85,
    ));
    if (blob.size > 5 * 1024 * 1024) throw new Error("The photo is still too large. Choose a smaller photo or enter manually.");
    return blob;
  } catch (error) {
    if (error instanceof Error && error.message.includes("photo")) throw error;
    throw new Error("This photo could not be opened. Try another or enter the meal manually.");
  } finally { URL.revokeObjectURL(url); }
}

export function photoBase64(photo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read this photo."));
    reader.readAsDataURL(photo);
  });
}
