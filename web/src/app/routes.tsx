import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { CourseBrowser } from "./pages/CourseBrowser";
import { CourseDetail } from "./pages/CourseDetail";
import { ProfessorProfile } from "./pages/ProfessorProfile";
import { UserDashboard } from "./pages/UserDashboard";
import { DegreePlanner } from "./pages/DegreePlanner";
import Login from "./pages/Login";
import { Register } from "./pages/Register";
import { NotFound } from "./pages/NotFound";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: "courses", Component: CourseBrowser },
      { path: "courses/:courseId", Component: CourseDetail },
      { path: "courses/:subject/:courseNumber", Component: CourseDetail },
      { path: "professors/:professorId", Component: ProfessorProfile },
      { path: "dashboard", Component: UserDashboard },
      { path: "planner", Component: DegreePlanner },
      { path: "login", Component: Login },
      { path: "signup", Component: Register },
      { path: "*", Component: NotFound },
    ],
  },
]);
