import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./style.css";
import { OrganizerShell, PortalShell, PublicShell, ReviewerShell } from "./components/shells";
import { ToastViewport } from "./components/ui";
import { CommandPage } from "./pages/CommandPage";
import { ReviewStudioPage, SubmissionsListPage } from "./pages/SubmissionsPages";
import { SchedulePage } from "./pages/SchedulePage";
import { CommsPage, SpeakerDetailPage, SpeakersPage } from "./pages/SpeakersCommsPages";
import { FormsPage, PublishPage, SettingsPage } from "./pages/PublishFormsSettings";
import {
  PortalHomePage,
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
import { AssignmentsPage, EvaluationPlanPage, ResultsPage, ReviewProgressPage } from "./pages/ReviewManagementPages";

restorePersonaFromSession();

function App() {
  return (
    <BrowserRouter>
      <ToastViewport />
      <Routes>
        <Route path="/" element={<DemoLandingPage />} />
        <Route path="/demo" element={<DemoLandingPage />} />

        <Route path="/app" element={<OrganizerShell />}>
          <Route index element={<CommandPage />} />
          <Route path="submissions" element={<SubmissionsListPage />} />
          <Route path="submissions/:id" element={<ReviewStudioPage />} />
          <Route path="evaluation-plan" element={<EvaluationPlanPage />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="review-progress" element={<ReviewProgressPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="speakers" element={<SpeakersPage />} />
          <Route path="speakers/:id" element={<SpeakerDetailPage />} />
          <Route path="comms" element={<CommsPage />} />
          <Route path="publish" element={<PublishPage />} />
          <Route path="forms" element={<FormsPage />} />
          <Route path="forms/:id" element={<FormsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route path="/r" element={<ReviewerShell />}>
          <Route index element={<ReviewerQueuePage />} />
          <Route path="done" element={<ReviewerQueuePage done />} />
          <Route path="guidelines" element={<ReviewerGuidelinesPage />} />
          <Route path=":submissionId" element={<ReviewerSubmissionPage />} />
        </Route>

        <Route path="/p" element={<PortalShell />}>
          <Route index element={<PortalHomePage />} />
          <Route path="talks" element={<PortalTalksPage />} />
          <Route path="tasks" element={<PortalTasksPage />} />
          <Route path="tasks/:id" element={<PortalTaskDetailPage />} />
          <Route path="resources" element={<PortalResourcesPage />} />
          <Route path="resources/:slug" element={<PortalResourceDetailPage />} />
          <Route path="profile" element={<PortalProfilePage />} />
        </Route>

        <Route path="/e/:slug" element={<PublicShell />}>
          <Route path="cfp" element={<PublicCfpPage />} />
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
