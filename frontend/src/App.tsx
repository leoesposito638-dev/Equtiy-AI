import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import { FollowedProvider } from "./lib/followedContext";
import OverviewPage from "./pages/OverviewPage";
import MyCompaniesPage from "./pages/MyCompaniesPage";
import DiscoverPage from "./pages/DiscoverPage";
import AlertsPage from "./pages/AlertsPage";
import CompanyPage from "./pages/CompanyPage";

export default function App() {
  return (
    <FollowedProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/companies" element={<MyCompaniesPage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/company/:id" element={<CompanyPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </FollowedProvider>
  );
}
