import { Outlet } from "@remix-run/react";
import { Frame } from "@shopify/polaris";

export default function AppLayout() {
  return (
    <Frame>
      <Outlet />
    </Frame>
  );
}
