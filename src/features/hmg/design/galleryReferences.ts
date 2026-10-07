import { galleryAssets } from './galleryAssets.mjs';
/** Rendered-page/lightbox verification and hashes: docs/hmg/gallery-assets.json.
 * Source images are inspiration, not product identity or usable surface textures.
 * URLs are never supplied by saved design JSON or end-user input.
 */
export type GalleryReference = {
  id: string; url?: string; title: string;
  sourcePageUrl: string;
  sourceUrl: string; sourceCaption: string; sourceCheckedAt: string;
  category: string; width: number; height: number; localUrl?: string;
  allowedUse: 'inspiration' | 'surface'; surfaceEligible: boolean;
  eligibilityReason: string;
  optionId?: string; stoneType?: string | null; colour?: string | null;
  variant?: string | null; description?: string; physicalDimensions?: unknown;
};
export const approvedGalleryReferences: readonly GalleryReference[] = galleryAssets;
