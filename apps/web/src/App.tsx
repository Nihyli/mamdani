import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { AppShell } from "./components/Layout";
import { MapPage } from "./pages/MapPage";
import { ReportPage } from "./pages/ReportPage";
import { FixedPage } from "./pages/FixedPage";
import { SubmitPage } from "./pages/SubmitPage";
import { MyReportsPage } from "./pages/MyReportsPage";
import { SignInPage } from "./pages/SignInPage";
import { AdminPage } from "./pages/AdminPage";
import { PrivacyPage, TermsPage } from "./pages/LegalPages";
import { brand } from "./lib/brand";
import { useEffect } from "react";

export default function App() {
  useEffect(() => {
    document.title = brand.name;
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<MapPage />} />
            <Route path="r/:slug" element={<ReportPage />} />
            <Route path="fixed" element={<FixedPage />} />
            <Route path="submit" element={<SubmitPage />} />
            <Route path="my-reports" element={<MyReportsPage />} />
            <Route path="my-reports/:submissionId" element={<MyReportsPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="sign-in" element={<SignInPage />} />
            <Route path="terms" element={<TermsPage />} />
            <Route path="privacy" element={<PrivacyPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
