import { useSyncExternalStore } from "react";
import { App } from ".";
import { SmallScreenFallback } from "./SmallScreenFallback";

/**
 * Below this width the editor and the right column (about 700px on its own) no longer fit side by side, so
 * the playground is replaced by a page that shows what it looks like and says where to open it.
 */
const SMALL_SCREEN_QUERY = "(max-width: 1023px)";

const subscribe = (onChange: () => void) => {
    const query = window.matchMedia(SMALL_SCREEN_QUERY);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
};

/** Whether the screen is too narrow for the playground, following the window as it is resized or rotated. */
const useIsSmallScreen = () => useSyncExternalStore(subscribe, () => window.matchMedia(SMALL_SCREEN_QUERY).matches);

/** The playground, or the fallback page on a screen too narrow for it. */
export const Root: React.FC = () => (useIsSmallScreen() ? <SmallScreenFallback /> : <App />);
