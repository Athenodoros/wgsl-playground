import { OverlayToaster, type ToastProps } from "@blueprintjs/core";
import { createRoot } from "react-dom/client";

const toasterPromise = OverlayToaster.createAsync(
    { position: "top", maxToasts: 3 },
    { domRenderer: (element, container) => createRoot(container).render(element) },
);

export const AppToaster = {
    show(options: ToastProps, key?: string): void {
        void toasterPromise
            .then((toaster) => toaster.show(options, key))
            .catch((error: unknown) => console.error("Could not show toast", error));
    },
};
