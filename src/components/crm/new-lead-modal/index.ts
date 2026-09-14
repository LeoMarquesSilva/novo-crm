export { ModalHeader, ModalHeaderIcon, type NewLeadModalPill } from "./modal-header";
export { SectionCard } from "./section-card";
export { InputField } from "./input-field";
export { SelectField } from "./select-field";
export { TagSelectable } from "./tag-selectable";
export { StickyFooter } from "./sticky-footer";
export {
  ClientPickerField,
  UserPickerField,
  type ClientOption,
  type SystemUserOption,
} from "./searchable-picker";

/** Shared field chrome for inputs / triggers inside the modal. */
export const newLeadModalFieldClass =
  "h-10 w-full min-w-0 rounded-(--radius-v2-md) border border-border bg-white px-3.5 text-sm text-foreground placeholder:text-text-placeholder-v2 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:outline-none disabled:bg-muted disabled:text-text-disabled-v2";
