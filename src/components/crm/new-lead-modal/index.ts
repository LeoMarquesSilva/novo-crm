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
  "h-11 w-full min-w-0 rounded-[13px] border border-[#dfe5ee] bg-white px-3.5 text-sm text-[#111827] shadow-[0_1px_2px_rgba(16,31,46,0.03)] transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus-visible:border-[#101f2e]/35 focus-visible:ring-[3px] focus-visible:ring-[#101f2e]/12 focus-visible:outline-none disabled:opacity-50";
