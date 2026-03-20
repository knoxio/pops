/**
 * Shell router configuration
 *
 * Currently renders a placeholder. US-2 and US-3 will wire in
 * lazy-loaded app routes from @pops/app-finance.
 */
import { createBrowserRouter, Navigate } from "react-router";

export const router = createBrowserRouter([
  {
    path: "/",
    children: [
      { index: true, element: <Navigate to="/finance" replace /> },
      {
        path: "finance",
        children: [
          {
            index: true,
            element: <div>Shell scaffold — finance routes will be wired in US-3</div>,
          },
        ],
      },
    ],
  },
]);
