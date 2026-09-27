// Centralized route table.
//
// Pages no longer take `user` / `onAuthed` / `onLogout` props — they
// read auth state via `useMe()` from `@/data/auth`. The route
// table only owns path-to-component mapping and the admin guard.
//
// Signed-in app pages live under the `AppShell` layout route (top bar,
// sidebar, details column, global overlays, keyboard shortcuts).
// Editors (`/f/:id`), public share pages and auth pages stay outside
// the shell so they keep their own chrome and never receive the
// single-key shortcuts.

import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AppShell } from "@/components/shell/AppShell";
import { useMe } from "@/data/auth";
import { UsersPage } from "@/features/admin/UsersPage";
import { InviteAcceptPage } from "@/features/auth/InviteAcceptPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { EditorPage } from "@/features/editor/EditorPage";
import { SharedEditorPage } from "@/features/editor/SharedEditorPage";
import { SharedTokenLandingPage } from "@/features/editor/SharedTokenLandingPage";
import { StaticSitePreviewRedirect } from "@/features/editor/StaticSitePreviewRedirect";
import { DashboardPage } from "@/features/explorer/DashboardPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { SharesPage } from "@/features/sharing/SharesPage";
import {
  RecentPlaceholder,
  StarredPlaceholder,
  TagPlaceholder,
  TrashPlaceholder,
} from "./placeholders";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />

      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/folders/:folderId" element={<DashboardPage />} />
        <Route path="/recent" element={<RecentPlaceholder />} />
        <Route path="/starred" element={<StarredPlaceholder />} />
        <Route path="/trash" element={<TrashPlaceholder />} />
        <Route path="/tags/:tag" element={<TagPlaceholder />} />
        <Route path="/shares" element={<SharesPage />} />
        <Route path="/settings/:section?" element={<SettingsPage />} />
        <Route
          path="/users/:tab?"
          element={
            <RequireAdmin>
              <UsersPage />
            </RequireAdmin>
          }
        />
      </Route>

      <Route path="/f/:id" element={<EditorPage />} />
      {/* Owner-facing stable preview URL for static-site files. The
          component mints a fresh signed `/sites/:id/:sig/...` URL on
          every visit and `location.replace`s into it — see
          StaticSitePreviewRedirect for the access-control story. */}
      <Route path="/f/:id/site" element={<StaticSitePreviewRedirect />} />
      {/* Legacy: pre-rebrand `/s/:id` URLs (bookmarks, browser history,
          tabs) redirect to the canonical /f/:id form. */}
      <Route path="/s/:id" element={<LegacyFileRedirect />} />
      {/* Legacy: pre-rebrand `/account` URLs redirect to the renamed
          `/settings` route so bookmarks and the back stack stay clean. */}
      <Route path="/account" element={<LegacyAccountRedirect />} />
      <Route path="/share/:token" element={<SharedTokenLandingPage />} />
      <Route path="/share/:token/files/:fileId" element={<SharedEditorPage />} />
      {/* Legacy folder-share child URLs (`.../scenes/:sceneId`) redirect
          to the renamed form. The share token itself is unchanged. */}
      <Route path="/share/:token/scenes/:sceneId" element={<LegacyFolderShareFileRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const me = useMe();
  if (me.isPending) return null;
  if (!me.data?.isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Legacy redirect: `/s/:id` was the editor URL before the scene → file
// rebrand. Old bookmarks / browser-history entries land here and bounce
// to the canonical `/f/:id` route, replacing the legacy entry so it does
// not clutter the back stack.
function LegacyFileRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/f/${id}` : "/"} replace />;
}

// Pre-rebrand `/account` URL — preferences and security used to live
// there. Replaced by `/settings`; we redirect with `replace` so the
// legacy entry doesn't litter browser history.
function LegacyAccountRedirect() {
  return <Navigate to="/settings" replace />;
}

// Same idea for the folder-share child URL.
function LegacyFolderShareFileRedirect() {
  const { token, sceneId } = useParams<{ token: string; sceneId: string }>();
  if (!token) return <Navigate to="/" replace />;
  return <Navigate to={sceneId ? `/share/${token}/files/${sceneId}` : `/share/${token}`} replace />;
}
