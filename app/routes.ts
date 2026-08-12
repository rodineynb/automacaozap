import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/login.tsx"),
  route("dashboard", "routes/performance.tsx"),
  route("automations", "routes/automations.tsx"),
  route("funnel-messages", "routes/funnel-messages.tsx"),
  route("chat", "routes/chat.tsx"),
  route("chat/:id", "routes/chat-detail.tsx"),
  route("reports", "routes/reports.tsx"),
  route("crm", "routes/crm.tsx"),
  route("followup", "routes/followup.tsx"),
  route("settings", "routes/settings.tsx"),
  route("products", "routes/products.tsx"),
  route("users", "routes/users.tsx"),
] satisfies RouteConfig;

