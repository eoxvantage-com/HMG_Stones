import { approvedGalleryReferences } from '../design/galleryReferences';

/**
 * Select an actual, locally mirrored HMG gallery photograph for an illustrative
 * direction card. These are inspiration references only, never stone textures.
 */
export function getDesignInspiration(index: number) {
  const images = approvedGalleryReferences.filter(
    (image) => image.allowedUse === 'inspiration' && !!image.localUrl,
  );
  if (!images.length || !Number.isFinite(index)) return undefined;
  const image = images[Math.abs(Math.trunc(index)) % images.length];
  if (!image) return undefined;
  return {
    id: image.id,
    src: image.localUrl!,
    alt: `${image.title} · ${image.category}`,
    source: image.sourcePageUrl,
    title: image.title,
    category: image.category,
    allowedUse: image.allowedUse,
  };
}
