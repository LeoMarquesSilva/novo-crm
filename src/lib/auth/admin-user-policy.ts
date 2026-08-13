import { z } from "zod";

export const adminInitialPasswordSchema = z
  .string()
  .min(12, "A senha inicial deve ter pelo menos 12 caracteres.")
  .max(128)
  .regex(/[a-z]/, "A senha deve conter uma letra minúscula.")
  .regex(/[A-Z]/, "A senha deve conter uma letra maiúscula.")
  .regex(/[0-9]/, "A senha deve conter um número.");

type AdminUserMutationInput = {
  action: "delete" | "change-role";
  actorAppUserId: string;
  targetAppUserId: string;
  targetRole: string;
  nextRole: string | null;
  adminCount: number;
};

type AdminUserMutationDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

export function evaluateAdminUserMutation(
  input: AdminUserMutationInput,
): AdminUserMutationDecision {
  if (
    input.action === "delete" &&
    input.actorAppUserId === input.targetAppUserId
  ) {
    return {
      allowed: false,
      reason: "Não é possível excluir a própria conta administrativa.",
    };
  }

  if (input.targetRole !== "admin" || input.adminCount > 1) {
    return { allowed: true };
  }

  if (input.action === "delete") {
    return {
      allowed: false,
      reason: "Não é possível excluir o último administrador.",
    };
  }

  if (input.nextRole !== "admin") {
    return {
      allowed: false,
      reason: "Não é possível remover o papel do último administrador.",
    };
  }

  return { allowed: true };
}
