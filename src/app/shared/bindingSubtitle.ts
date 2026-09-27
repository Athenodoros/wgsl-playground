import { WgslBinding } from "../../utilities/types";

export const getBindingSubtitle = (binding: WgslBinding) => `(Group ${binding.group}, Binding ${binding.index})`;
