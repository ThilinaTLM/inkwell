// Centralized route table.
//
// Pages no longer take `user` / `onAuthed` / `onLogout` props — they
// read auth state via `useMe()` from `@/features/auth/hooks`. The route
// table only owns path-to-component mapping and the admin guard.

import { Navigate, Route, Routes } from "react-router-dom";

import LoginPage from "@/features/auth/LoginPage";
import AccountPage from "@/features/auth/AccountPage";
import InviteAcceptPage from "@/features/auth/InviteAcceptPage";
import AdminPage from "@/features/admin/AdminPage";
import DashboardPage from "@/features/explorer/DashboardPage";
import EditorPage from "@/features/editor/EditorPage";
import SharedEditorPage from "@/features/editor/SharedEditorPage";
import SharedTokenLandingPage from "@/features/editor/SharedTokenLandingPage";
import { useMe } from "@/features/auth/hooks";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />
      <Route path="/" element={<DashboardPage />} />
      <Route path="/s/:id" element={<EditorPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminPage />
          </RequireAdmin>
        }
      />
      <Route path="/share/:token" element={<SharedTokenLandingPage />} />
      <Route path="/share/:token/scenes/:sceneId" element={<SharedEditorPage />} />
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
