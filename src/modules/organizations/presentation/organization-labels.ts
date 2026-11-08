import type {
  MembershipRole,
  OrganizationStatus,
} from "../domain/organization";

export const roleLabels: Record<MembershipRole, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  OPERATOR: "Operador",
};
export const statusLabels: Record<OrganizationStatus, string> = {
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
};
