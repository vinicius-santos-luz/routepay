import { OrganizationError } from "../domain/errors";
import { parseOrganizationName } from "../domain/organization";

/** Browser feedback reuses the server rule. Server validation remains mandatory. */
export function validateOrganizationNameInput(
  input: Pick<HTMLInputElement, "value" | "setCustomValidity">,
) {
  try {
    parseOrganizationName(input.value);
    input.setCustomValidity("");
  } catch {
    input.setCustomValidity(new OrganizationError("INVALID_INPUT").message);
  }
}
