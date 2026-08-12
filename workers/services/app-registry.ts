import { Hono } from "hono";

let appInstance: Hono<any> | null = null;

export function setApp(app: Hono<any>) {
  appInstance = app;
}

export function getApp(): Hono<any> | null {
  return appInstance;
}
