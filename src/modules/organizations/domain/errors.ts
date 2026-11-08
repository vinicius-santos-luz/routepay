export type OrganizationErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "ACCESS_DENIED"
  | "INVALID_TRANSITION"
  | "DUPLICATE_MEMBERSHIP"
  | "OWNER_REQUIRED"
  | "UNAVAILABLE";

const messages: Record<OrganizationErrorCode, string> = {
  INVALID_INPUT: "Confira o nome e os identificadores informados.",
  UNAUTHENTICATED: "Entre novamente para acessar suas organizações.",
  ACCESS_DENIED: "Organização não encontrada ou acesso não autorizado.",
  INVALID_TRANSITION: "Esta mudança de estado não é permitida.",
  DUPLICATE_MEMBERSHIP: "Já existe um vínculo deste usuário com a organização.",
  OWNER_REQUIRED: "Uma organização ativa precisa de um proprietário ativo.",
  UNAVAILABLE:
    "Organizações indisponíveis no momento. Tente novamente mais tarde.",
};

export class OrganizationError extends Error {
  constructor(readonly code: OrganizationErrorCode) {
    super(messages[code]);
    this.name = "OrganizationError";
  }
}
