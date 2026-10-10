import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { SmallScreenFallback, useIsSmallScreen } from "./app/SmallScreenFallback";
import "./index.css";

const Root = () => (useIsSmallScreen() ? <SmallScreenFallback /> : <App />);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <Root />
    </StrictMode>,
);
