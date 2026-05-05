// Centralized route table.
//
// Pages no longer take `user` / `onAuthed` / `onLogout` props — they
// read auth state via `useMe()` from `@/data/auth`. The route
// table only owns path-to-component mapping and the admin guard.

import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useMe } from "@/data/auth";
import { UsersPage } from "@/features/admin/UsersPage";
import { AccountPage } from "@/features/auth/AccountPage";
import { InviteAcceptPage } from "@/features/auth/InviteAcceptPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { EditorPage } from "@/features/editor/EditorPage";
import { SharedEditorPage } from "@/features/editor/SharedEditorPage";
import { SharedTokenLandingPage } from "@/features/editor/SharedTokenLandingPage";
import { DashboardPage } from "@/features/explorer/DashboardPage";
import { SharesPage } from "@/features/sharing/SharesPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />
      <Route path="/" element={<DashboardPage />} />
      <Route path="/folders/:folderId" element={<DashboardPage />} />
      <Route path="/f/:id" element={<EditorPage />} />
      {/* Legacy: pre-rebrand `/s/:id` URLs (bookmarks, browser history,
          tabs) redirect to the canonical /f/:id form. */}
      <Route path="/s/:id" element={<LegacyFileRedirect />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/shares" element={<SharesPage />} />
      <Route
        path="/users"
        element={
          <RequireAdmin>
            <UsersPage />
          </RequireAdmin>
        }
      />
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

// Same idea for the folder-share child URL.
function LegacyFolderShareFileRedirect() {
  const { token, sceneId } = useParams<{ token: string; sceneId: string }>();
  if (!token) return <Navigate to="/" replace />;
  return <Navigate to={sceneId ? `/share/${token}/files/${sceneId}` : `/share/${token}`} replace />;
}
