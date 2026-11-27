import type { Pic } from "@/lib/media";
import { Photo } from "../Photo";

/** Renders a resolved media picture (a supplied file or a product photo). Decorative by default (alt=""). The parent sets the aspect ratio. */
export function PicView({ pic, alt = "", sizes, className = "", position = "center" }: { pic: Pic; alt?: string; sizes: string; className?: string; position?: string }) {
  const src = pic.kind === "file" ? pic.slot.path : pic.photo.src;
  return <Photo src={src} alt={alt} sizes={sizes} className={className} position={position} />;
}
