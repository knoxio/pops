/**
 * Shell router configuration
 *
 * RootLayout provides the top bar + sidebar chrome.
 * US-3 will wire in lazy-loaded app routes from @pops/app-finance.
 */
import { createBrowserRouter, Navigate } from "react-router";
import { RootLayout } from "./layout/RootLayout";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/finance" replace /> },
      {
        path: "finance",
        children: [
          {
            index: true,
            element: (
              <div className="p-6 text-muted-foreground">
                Shell layout ready — finance routes will be wired in US-3
              </div>
            ),
          },
        ],
      },
    ],
  },
]);
