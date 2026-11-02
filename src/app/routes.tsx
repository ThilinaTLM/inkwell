// Centralized route table.
//
// Pages no longer take `user` / `onAuthed` / `onLogout` props — they
// read auth state via `useMe()` from `@/data/auth`. The route
// table only owns path-to-component mapping and the admin guard.
//
// Signed-in app pages live under the `AppShell` layout route (sidebar,
// mobile bottom bar, global overlays, keyboard shortcuts).
// Editors (`/f/:id`), public share pages and auth pages stay outside
// the shell so they keep their own chrome and never receive the
// single-key shortcuts.

import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AppShell } from "@/components/shell/AppShell";
import { InviteAcceptPage } from "@/features/auth/InviteAcceptPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { FilesPage } from "@/features/pages/FilesPage";
import { FolderPage } from "@/features/pages/FolderPage";
import { HomePage } from "@/features/pages/HomePage";
import { InboxPage } from "@/features/pages/InboxPage";
import { ProjectsPage } from "@/features/pages/ProjectsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";

const EditorPage = lazy(() =>
  import("@/features/editor/EditorPage").then((module) => ({ default: module.EditorPage })),
);
const SharedEditorPage = lazy(() =>
  import("@/features/editor/SharedEditorPage").then((module) => ({
    default: module.SharedEditorPage,
  })),
);
const SharedTokenLandingPage = lazy(() =>
  import("@/features/editor/SharedTokenLandingPage").then((module) => ({
    default: module.SharedTokenLandingPage,
  })),
);
const StaticSitePreviewRedirect = lazy(() =>
  import("@/features/editor/StaticSitePreviewRedirect").then((module) => ({
    default: module.StaticSitePreviewRedirect,
  })),
);

function lazyRoute(element: React.ReactNode) {
  return <Suspense fallback={null}>{element}</Suspense>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />

      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/folders/:folderId" element={<FolderPage />} />
        <Route path="/files/:tab?" element={<FilesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* Legacy library routes → Files hub tabs. */}
        <Route path="/recent" element={<Navigate to="/files/recent" replace />} />
        <Route path="/starred" element={<Navigate to="/files/starred" replace />} />
        <Route path="/trash" element={<Navigate to="/files/trash" replace />} />
        <Route path="/shares" element={<Navigate to="/files/shared" replace />} />
        <Route path="/tags/:tag" element={<Navigate to="/files" replace />} />
        {/* Users & invites live in Settings → Admin; retired settings panes
            fall back to the single Settings page. */}
        <Route path="/users/:tab?" element={<Navigate to="/settings#admin" replace />} />
        <Route path="/settings/:section" element={<SettingsSectionRoute />} />
      </Route>

      <Route path="/f/:id" element={lazyRoute(<EditorPage />)} />
      {/* Owner-facing stable preview URL for static-site files. The
          component mints a fresh signed `/sites/:id/:sig/...` URL on
          every visit and `location.replace`s into it — see
          StaticSitePreviewRedirect for the access-control story. */}
      <Route path="/f/:id/site" element={lazyRoute(<StaticSitePreviewRedirect />)} />
      {/* Legacy: pre-rebrand `/s/:id` URLs (bookmarks, browser history,
          tabs) redirect to the canonical /f/:id form. */}
      <Route path="/s/:id" element={<LegacyFileRedirect />} />
      {/* Legacy: pre-rebrand `/account` URLs redirect to the renamed
          `/settings` route so bookmarks and the back stack stay clean. */}
      <Route path="/account" element={<LegacyAccountRedirect />} />
      <Route path="/share/:token" element={lazyRoute(<SharedTokenLandingPage />)} />
      <Route path="/share/:token/files/:fileId" element={lazyRoute(<SharedEditorPage />)} />
      {/* Legacy folder-share child URLs (`.../scenes/:sceneId`) redirect
          to the renamed form. The share token itself is unchanged. */}
      <Route path="/share/:token/scenes/:sceneId" element={<LegacyFolderShareFileRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const RETIRED_SETTINGS_SECTIONS = new Set(["explorer", "shortcuts", "editors", "tags"]);

// `/settings/:section` scrolls to a section of the one-page Settings;
// retired panes redirect to plain `/settings`.
function SettingsSectionRoute() {
  const { section = "" } = useParams<{ section: string }>();
  if (RETIRED_SETTINGS_SECTIONS.has(section)) return <Navigate to="/settings" replace />;
  return <SettingsPage />;
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
