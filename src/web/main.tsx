import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./style.css";
import { OrganizerShell, PortalShell, PublicShell, ReviewerShell } from "./components/shells";
import { ToastViewport } from "./components/ui";
import { CommandPage } from "./pages/CommandPage";
import { ReviewStudioPage, SubmissionsListPage } from "./pages/SubmissionsPages";
import { SchedulePage } from "./pages/SchedulePage";
import { SessionsPage } from "./pages/SessionsPage";
import { CommsPage, SpeakerDetailPage, SpeakersPage } from "./pages/SpeakersCommsPages";
import { FormsPage, PublishPage, SettingsPage } from "./pages/PublishFormsSettings";
import {
  PortalHomePage,
  PortalDeliverablesPage,
  PortalDeliverableDetailPage,
  PortalProfilePage,
  PortalResourceDetailPage,
  PortalResourcesPage,
  PortalTaskDetailPage,
  PortalTasksPage,
  PortalTalksPage,
} from "./pages/PortalPages";
import {
  DemoLandingPage,
  PublicCfpPage,
  ReviewerGuidelinesPage,
  ReviewerQueuePage,
  ReviewerSubmissionPage,
} from "./pages/PublicReviewerPages";
import { restorePersonaFromSession } from "./lib/api";
import { refreshSession } from "./lib/auth";
import { LoginPage, SignupPage } from "./pages/AuthPages";
import { AssignmentsPage, EvaluationPlanPage, ResultsPage, ReviewProgressPage } from "./pages/ReviewManagementPages";
import { ContentPage } from "./pages/ContentPages";
import { MarketingLandingPage } from "./pages/MarketingLandingPage";
import {
  CrmCampaignsPage,
  CrmContactPage,
  CrmDirectoryPage,
  CrmImportPage,
  CrmPipelinePage,
  CrmSegmentsPage,
} from "./pages/CrmPages";

restorePersonaFromSession();
// Resolve the real session cookie once at boot; shells and /login read the cache.
// A missing session is the normal demo case and resolves to "anonymous".
void refreshSession();

function App() {
  return (
    <BrowserRouter>
      <ToastViewport />
      <Routes>
        <Route path="/" element={<MarketingLandingPage />} />
        <Route path="/demo" element={<DemoLandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        <Route path="/app" element={<OrganizerShell />}>
          <Route index element={<CommandPage />} />
          <Route path="submissions" element={<SubmissionsListPage />} />
          <Route path="submissions/:id" element={<ReviewStudioPage />} />
          <Route path="evaluation-plan" element={<EvaluationPlanPage />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="review-progress" element={<ReviewProgressPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="speakers" element={<SpeakersPage />} />
          <Route path="speakers/:id" element={<SpeakerDetailPage />} />
          <Route path="crm" element={<CrmDirectoryPage />} />
          <Route path="crm/pipeline" element={<CrmPipelinePage />} />
          <Route path="crm/segments" element={<CrmSegmentsPage />} />
          <Route path="crm/import" element={<CrmImportPage />} />
          <Route path="crm/campaigns" element={<CrmCampaignsPage />} />
          <Route path="crm/contacts/:id" element={<CrmContactPage />} />
          <Route path="content" element={<ContentPage />} />
          <Route path="comms" element={<CommsPage />} />
          <Route path="publish" element={<PublishPage />} />
          <Route path="forms" element={<FormsPage />} />
          <Route path="forms/:id" element={<FormsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route path="/r" element={<ReviewerShell />}>
          <Route index element={<ReviewerQueuePage key="queue" />} />
          <Route path="done" element={<ReviewerQueuePage key="done" done />} />
          <Route path="guidelines" element={<ReviewerGuidelinesPage />} />
          <Route path=":submissionId" element={<ReviewerSubmissionPage />} />
        </Route>

        <Route path="/p" element={<PortalShell />}>
          <Route index element={<PortalHomePage />} />
          <Route path="talks" element={<PortalTalksPage />} />
          <Route path="tasks" element={<PortalTasksPage />} />
          <Route path="tasks/:id" element={<PortalTaskDetailPage />} />
          <Route path="deliverables" element={<PortalDeliverablesPage />} />
          <Route path="deliverables/:id" element={<PortalDeliverableDetailPage />} />
          <Route path="resources" element={<PortalResourcesPage />} />
          <Route path="resources/:slug" element={<PortalResourceDetailPage />} />
          <Route path="profile" element={<PortalProfilePage />} />
        </Route>

        <Route path="/e/:slug" element={<PublicShell />}>
          <Route path="cfp" element={<PublicCfpPage />} />
          {/* Additional submission forms; /cfp keeps serving the primary form. */}
          <Route path="cfp/:formId" element={<PublicCfpPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
