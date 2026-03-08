import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { CourseBrowser } from "./pages/CourseBrowser";
import { CourseDetail } from "./pages/CourseDetail";
import { ProfessorProfile } from "./pages/ProfessorProfile";
import { BrowseInstructors } from "./pages/BrowseInstructors";
import { UserDashboard } from "./pages/UserDashboard";
import { DegreePlanner } from "./pages/DegreePlanner";
import Login from "./pages/Login";
import { Register } from "./pages/Register";
import { NotFound } from "./pages/NotFound";
import { Contributors } from "./pages/Contributors";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import { ProtectedRoute } from "./components/ProtectedRoute";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: "courses", Component: CourseBrowser },
      { path: "courses/:courseId", Component: CourseDetail },
      { path: "courses/:subject/:courseNumber", Component: CourseDetail },
      { path: "professors", Component: BrowseInstructors },
      { path: "professors/:professorId", Component: ProfessorProfile },
      // Protected routes — unauthenticated visitors are redirected to /login
      {
        element: <ProtectedRoute />,
        children: [
          { path: "dashboard", Component: UserDashboard },
          { path: "planner", Component: DegreePlanner },
        ],
      },
      { path: "login", Component: Login },
      { path: "signup", Component: Register },
      { path: "forgot-password", Component: ForgotPassword },
      { path: "reset-password", Component: ResetPassword },
      { path: "contributors", Component: Contributors },
      { path: "*", Component: NotFound },
    ],
  },
]);
