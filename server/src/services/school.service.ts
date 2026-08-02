import sharp from 'sharp';

import { env } from '../config/env';
import { prisma } from '../lib/prisma';

export interface SchoolContext {
  name: string;
  motto: string;
  studentIdPrefix: string;
  hasBadge: boolean;
  badge: Buffer | null;
}

/** The singleton branding row, created from env defaults on first access. */
export async function getSchoolSettings() {
  let settings = await prisma.schoolSetting.findUnique({ where: { id: 'school' } });
  if (!settings) {
    settings = await prisma.schoolSetting.create({
      data: { id: 'school', name: env.SCHOOL_NAME, motto: env.SCHOOL_MOTTO },
    });
  }
  return settings;
}

export async function getSchoolContext(): Promise<SchoolContext> {
  const s = await getSchoolSettings();
  return {
    name: s.name,
    motto: s.motto,
    studentIdPrefix: s.studentIdPrefix,
    hasBadge: s.badgeData !== null,
    badge: s.badgeData ? Buffer.from(s.badgeData) : null,
  };
}

/** Normalize a badge/logo upload: rotate, fit inside 512×512, save as PNG (alpha preserved). */
export async function processBadge(
  input: Buffer,
): Promise<{ png: Buffer; width: number; height: number }> {
  const png = await sharp(input)
    .rotate()
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  if (png.length > 600_000) {
    throw new Error('Badge image is still too large after compression — try a smaller image');
  }
  const meta = await sharp(png).metadata();
  return { png, width: meta.width ?? 0, height: meta.height ?? 0 };
}
