import { flatRoutes } from "@remix-run/fs-routes";

export default flatRoutes({
  ignoredRouteFiles: [
    "**/*.test.{js,jsx,ts,tsx}",
    "**/*.spec.{js,jsx,ts,tsx}",
  ],
});
