import { toast } from "sonner";

/** Brief "Saved" confirmation after an explicit save (Ctrl/⌘+S or clicking the state). */
export function notifySaved(): void {
  toast.success("Saved", { id: "editor-saved", duration: 1400 });
}
