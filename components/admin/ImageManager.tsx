import { archiveProduct, deleteImage, moveImage, updateImage, uploadImage } from "@/app/admin/(app)/products/actions";
import type { Row } from "@/lib/db";
import { Photo } from "../Photo";
import { ActionForm, SubmitButton } from "./ActionForm";
import { Card, SectionTitle } from "./ui";

/** Product images: upload, alt text, role, reorder, remove. Everything is logged in the activity log. */
export function ImageManager({ productId, images }: { productId: string; images: Row[] }) {
  return (
    <Card>
      <SectionTitle>Images</SectionTitle>
      <p className="mb-4 text-[14px] text-body">
        Order matters: the first image is the main product photo. Roles place images on the page: <b>pouch-hero</b> (cards & hero), <b>flat-lay</b> (12-sachets block), <b>sachet-open</b> (how to use), <b>ingredients</b> (background). Use 4:5 portrait photos.
      </p>
      <ul className="space-y-4">
        {images.map((im, n) => (
          <li key={im.id} className="admin-card-flat grid gap-4 p-4 sm:grid-cols-[110px_1fr]">
            <div className="relative aspect-[4/5] w-[110px] overflow-hidden rounded-xl border border-white/10">
              <Photo src={im.src} alt={im.alt} sizes="110px" className="h-full w-full" />
            </div>
            <div className="space-y-3">
              <ActionForm action={updateImage} className="grid gap-3 md:grid-cols-[1fr_1fr_170px_auto] md:items-end">
                <input type="hidden" name="image_id" value={im.id} />
                <label className="block"><span className="a-label">Alt text (describe the photo)</span><input name="alt" defaultValue={im.alt} required className="a-input" /></label>
                <label className="block"><span className="a-label">Label</span><input name="label" defaultValue={im.label} className="a-input" /></label>
                <label className="block"><span className="a-label">Role</span>
                  <select name="kind" defaultValue={im.kind} className="a-input">
                    {["pouch-hero", "flat-lay", "sachet-open", "ingredients", "extra"].map((k) => <option key={k}>{k}</option>)}
                  </select>
                </label>
                <SubmitButton variant="glass">Save</SubmitButton>
              </ActionForm>
              <div className="flex flex-wrap gap-2">
                <ActionForm action={moveImage} className="contents">
                  <input type="hidden" name="image_id" value={im.id} />
                  <SubmitButton variant="glass" name="dir" value="up">↑ Up</SubmitButton>
                  <SubmitButton variant="glass" name="dir" value="down">↓ Down</SubmitButton>
                </ActionForm>
                <ActionForm action={deleteImage} className="contents">
                  <input type="hidden" name="image_id" value={im.id} />
                  <SubmitButton variant="danger" confirm="Remove this image from the product?">Remove</SubmitButton>
                </ActionForm>
                <span className="mono self-center !text-muted">#{n + 1}</span>
              </div>
            </div>
          </li>
        ))}
        {images.length === 0 && <li className="text-[15px] text-body">No images yet. Upload the first one below.</li>}
      </ul>

      <ActionForm action={uploadImage} resetOnSuccess className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <input type="hidden" name="id" value={productId} />
        <label className="block"><span className="a-label">Upload image (JPG / PNG / WebP, max 8 MB)</span><input name="file" type="file" accept="image/jpeg,image/png,image/webp" required className="a-input !py-2.5 file:mr-3 file:rounded-full file:border-0 file:bg-fg file:px-4 file:py-1.5 file:text-black" /></label>
        <label className="block"><span className="a-label">Alt text</span><input name="alt" required placeholder="RED BURN pouch with pomegranate" className="a-input" /></label>
        <SubmitButton variant="lime">Upload</SubmitButton>
      </ActionForm>
    </Card>
  );
}

export function ArchiveBox({ productId, archived }: { productId: string; archived: boolean }) {
  return (
    <Card>
      <SectionTitle>{archived ? "Archived" : "Archive"}</SectionTitle>
      <p className="mb-3 text-[14px] text-body">Products are never deleted, so order history stays intact. Archiving just hides it from the store.</p>
      <ActionForm action={archiveProduct}>
        <input type="hidden" name="id" value={productId} />
        {archived && <input type="hidden" name="restore" value="1" />}
        <SubmitButton variant={archived ? "glass" : "danger"} confirm={archived ? undefined : "Archive this product? It will disappear from the store."}>{archived ? "Restore as draft" : "Archive product"}</SubmitButton>
      </ActionForm>
    </Card>
  );
}
