// Filter state shared by the Transactions and Dashboard screens.

export const EMPTY_FILTERS = {
  q: "", tag: "", payee: "", type: "", payment_method: "", status: "",
  min_amount: "", max_amount: "", date_from: "", date_to: "",
};

/** UI state -> API query params. The tag dropdown's "untagged" value becomes untagged=true. */
export function toParams(f) {
  const { tag, ...rest } = f;
  return { ...rest, tag_id: tag && tag !== "untagged" ? tag : "", untagged: tag === "untagged" };
}

export const countActive = (f, ignore = []) =>
  Object.entries(f).filter(([k, v]) => v !== "" && !ignore.includes(k)).length;
