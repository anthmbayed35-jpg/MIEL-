import type { ProductPhoto } from "@/config/products";
import { Photo } from "./Photo";

/** Photo when available, otherwise a labelled placeholder. Parent sets the aspect ratio (4:5). */
export function ProductImage({
  photo,
  alt,
  label,
  sizes,
  priority = false,
  className = "",
}: {
  photo?: ProductPhoto;
  alt: string;
  label: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  if (photo) return <Photo src={photo.src} alt={photo.alt} sizes={sizes} priority={priority} className={className} />;
  return (
    <div role="img" aria-label={`${alt} (image placeholder)`} className={`flex items-center justify-center ${className}`}>
      <span className="mono !text-body text-center opacity-70">{label}</span>
    </div>
  );
}
