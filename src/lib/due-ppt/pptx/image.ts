import { REL, type PptxPackage } from "./package";
import { box, findShape, setPos, setSize } from "./shapes";
import { NS, desc, firstDesc, remove } from "./xml";

export type ImageAsset = { bytes: Uint8Array; contentType: "image/png" | "image/jpeg" };

/** Largura/altura em pixels de PNG ou JPEG (só o cabeçalho). */
export function imageSize(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1]!;
      const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: (bytes[i + 5]! << 8) | bytes[i + 6]!, w: (bytes[i + 7]! << 8) | bytes[i + 8]! };
      }
      i += 2 + len;
    }
  }
  return null;
}

let counter = 0;

/**
 * Troca a imagem do shape `name` pela enviada, cabendo na caixa original
 * (sem distorcer, centralizada).
 */
export function replaceImage(pkg: PptxPackage, slidePath: string, name: string, img: ImageAsset): boolean {
  const doc = pkg.xml(slidePath);
  const pic = findShape(doc, name);
  if (!pic) return false;
  const blip = firstDesc(pic, NS.a, "blip");
  if (!blip) return false;
  const ext = img.contentType === "image/png" ? "png" : "jpeg";
  pkg.ensureDefault(ext, img.contentType);
  counter += 1;
  const mediaPath = `ppt/media/due-crm-${Date.now().toString(36)}-${counter}.${ext}`;
  pkg.writeBytes(mediaPath, img.bytes);
  const rid = pkg.addRel(slidePath, REL.image, mediaPath);
  blip.setAttributeNS(NS.r, "r:embed", rid);
  // Versão SVG do placeholder (se houver) sairia por cima da nova imagem.
  for (const extLst of desc(blip, NS.a, "extLst")) remove(extLst);
  // Corte/esticamento do placeholder não valem para a nova imagem.
  const srcRect = firstDesc(pic, NS.a, "srcRect");
  if (srcRect) remove(srcRect);

  const size = imageSize(img.bytes);
  if (size && size.w > 0 && size.h > 0) {
    const b = box(pic);
    const scale = Math.min(b.w / size.w, b.h / size.h);
    const w = size.w * scale;
    const h = size.h * scale;
    setSize(pic, w, h);
    setPos(pic, b.x + (b.w - w) / 2, b.y + (b.h - h) / 2);
  }
  return true;
}
