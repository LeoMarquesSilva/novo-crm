import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/server";
import { EvolutionWhatsappConnector } from "@/modules/crm/infrastructure/integrations/evolution-whatsapp";

type EvolutionDestinationItem = {
  id: string;
  label: string;
  destination_type: "number" | "group";
};

function parseContactPhone(rawId: string): string | null {
  const normalized = rawId.trim().toLowerCase();
  if (!normalized) return null;
  if (!normalized.includes("@")) return normalized.replace(/\D/g, "") || null;
  const [phone, domain] = normalized.split("@");
  if (domain !== "s.whatsapp.net" && domain !== "c.us") return null;
  const digits = phone.replace(/\D/g, "");
  return digits || null;
}

function contactLabel(contact: Record<string, unknown>, fallback: string): string {
  const candidates = [
    contact.pushName,
    contact.name,
    contact.verifiedName,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function groupLabel(group: Record<string, unknown>, fallback: string): string {
  const candidates = [group.subject, group.name];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    if (Array.isArray((value as { contacts?: unknown[] }).contacts)) {
      return (value as { contacts: T[] }).contacts;
    }
    if (Array.isArray((value as { groups?: unknown[] }).groups)) {
      return (value as { groups: T[] }).groups;
    }
  }
  return [];
}

export async function GET() {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const baseUrl =
      process.env.EVOLUTION_API_URL ??
      process.env.EVOLUTION_API_BASE_URL ??
      "";
    const apiKey = process.env.EVOLUTION_API_KEY ?? "";
    const instance =
      process.env.EVOLUTION_INSTANCE ??
      process.env.EVOLUTION_INSTANCE_NAME ??
      "BP";

    const connector = new EvolutionWhatsappConnector(baseUrl, apiKey, instance);
    const [contactsResult, groupsResult] = await Promise.allSettled([
      connector.listContacts(),
      connector.listGroups(),
    ]);

    const contacts: EvolutionDestinationItem[] = [];
    const groups: EvolutionDestinationItem[] = [];

    if (contactsResult.status === "fulfilled") {
      const rawContacts = toArray<Record<string, unknown>>(contactsResult.value);
      for (const contact of rawContacts) {
        if (typeof contact.id !== "string") continue;
        const phone = parseContactPhone(contact.id);
        if (!phone) continue;
        contacts.push({
          id: phone,
          label: contactLabel(contact, phone),
          destination_type: "number",
        });
      }
    }

    if (groupsResult.status === "fulfilled") {
      const rawGroups = toArray<Record<string, unknown>>(groupsResult.value);
      for (const group of rawGroups) {
        if (typeof group.id !== "string") continue;
        const id = group.id.trim();
        if (!id.endsWith("@g.us")) continue;
        groups.push({
          id,
          label: groupLabel(group, id),
          destination_type: "group",
        });
      }
    }

    const dedupe = (items: EvolutionDestinationItem[]) => {
      const map = new Map<string, EvolutionDestinationItem>();
      for (const item of items) {
        if (!map.has(item.id)) map.set(item.id, item);
      }
      return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    };

    const warnings: string[] = [];
    if (contactsResult.status === "rejected") warnings.push("Não foi possível carregar contatos.");
    if (groupsResult.status === "rejected") warnings.push("Não foi possível carregar grupos.");

    return NextResponse.json({
      instance,
      contacts: dedupe(contacts),
      groups: dedupe(groups),
      warning: warnings.length > 0 ? warnings.join(" ") : null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao consultar contatos/grupos da Evolution.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
