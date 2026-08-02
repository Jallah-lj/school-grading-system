import sharp from 'sharp';

import { prisma } from '../lib/prisma';

/**
 * Signature image pipeline — turns a raw camera photo / canvas PNG of a
 * signature into a compact, transparent-background PNG suitable for stamping:
 *
 *   1. EXIF auto-rotation (phone photos are often rotated)
 *   2. Downscale to a sensible working size
 *   3. Paper background → transparent, using a soft luminance ramp
 *      (dark ink stays fully opaque, paper fades out smoothly)
 *   4. Auto-crop to the ink bounding box (+ padding)
 *   5. Final downscale + max-compression PNG
 *
 * Ink color (blue/black/red) is preserved — only lightness becomes alpha.
 */

const INK_THRESHOLD = 200; // luminance below this = solid ink
const FADE_RANGE = 35; // luminance 200–235 fades out → paper & shadows vanish
const PADDING = 10; // px kept around the ink bounding box

export interface ProcessedSignature {
  png: Buffer;
  width: number;
  height: number;
}

export async function processSignatureImage(input: Buffer): Promise<ProcessedSignature> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: 900, withoutEnlargement: true })
    .median(3) // despeckle JPEG/camera noise so specks don't become ink
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = data;
  const { width, height } = info;
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = px[i],
        g = px[i + 1],
        b = px[i + 2],
        a = px[i + 3];
      if (a === 0) continue;

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      let alpha: number;
      if (luma <= INK_THRESHOLD) alpha = 255;
      else if (luma >= INK_THRESHOLD + FADE_RANGE) alpha = 0;
      else alpha = Math.round(255 * (1 - (luma - INK_THRESHOLD) / FADE_RANGE));

      const outA = Math.round((alpha * a) / 255);
      px[i + 3] = outA;

      if (outA > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    throw new Error(
      'No ink detected. Use a well-lit close-up photo, or draw your signature instead.',
    );
  }

  const left = Math.max(0, minX - PADDING);
  const top = Math.max(0, minY - PADDING);
  const cropW = Math.min(width - left, maxX - minX + 1 + PADDING * 2);
  const cropH = Math.min(height - top, maxY - minY + 1 + PADDING * 2);

  const png = await sharp(px, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: cropW, height: cropH })
    .resize({ width: 480, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();

  const meta = await sharp(png).metadata();
  return { png, width: meta.width ?? cropW, height: meta.height ?? cropH };
}

export interface CardSignature {
  name: string;
  title: string;
  png: Buffer | null;
}

/**
 * Resolve who stamps a report card:
 *  - Class-teacher slot → the homeroom teacher of the student's class
 *  - Principal slot     → the admin who published the card (fallback: first
 *                         admin who has uploaded a signature)
 */
export async function resolveCardSignatures(
  classId: string | null,
  publishedById: string | null,
): Promise<{ classTeacher: CardSignature | null; principal: CardSignature | null }> {
  let classTeacher: CardSignature | null = null;

  if (classId) {
    const classRoom = await prisma.classRoom.findUnique({
      where: { id: classId },
      include: { homeroomTeacher: { include: { user: { include: { signature: true } } } } },
    });
    const teacher = classRoom?.homeroomTeacher;
    if (teacher) {
      classTeacher = {
        name: teacher.user.name,
        title: teacher.user.signature?.title ?? 'Class Teacher',
        png: teacher.user.signature?.data ? Buffer.from(teacher.user.signature.data) : null,
      };
    }
  }

  const publisher = publishedById
    ? await prisma.user.findUnique({ where: { id: publishedById }, include: { signature: true } })
    : null;
  const principalUser = publisher?.signature
    ? publisher
    : await prisma.user.findFirst({
        where: { role: 'ADMIN', signature: { isNot: null } },
        include: { signature: true },
        orderBy: { createdAt: 'asc' },
      });

  const principal: CardSignature | null = principalUser
    ? {
        name: principalUser.name,
        title: principalUser.signature?.title ?? 'Principal / Head of School',
        png: principalUser.signature?.data ? Buffer.from(principalUser.signature.data) : null,
      }
    : null;

  return { classTeacher, principal };
}
