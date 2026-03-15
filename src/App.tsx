import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import SearchPage from "./pages/SearchPage";
import DownloadsPage from "./pages/DownloadsPage";

const App = () => (
  <BrowserRouter>
    <Sonner />
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<SearchPage />} />
        <Route path="/downloads" element={<DownloadsPage />} />
      </Route>
    </Routes>
  </BrowserRouter>
);

export default App;
