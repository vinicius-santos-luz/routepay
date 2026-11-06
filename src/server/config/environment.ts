import "server-only";
import { parseApplicationEnvironment } from "@/shared/validation/application-environment";

export function getApplicationEnvironment() {
  return parseApplicationEnvironment(process.env.APP_ENV);
}
