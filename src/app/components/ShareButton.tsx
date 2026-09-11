import { Button, OverlayToaster, Tooltip } from "@blueprintjs/core";
import { useEffect, useRef, useState } from "react";
import { useAppState } from "../../state";
import { INITIAL_SHARE_LINK } from "../../state/defaults";
import { createShareLink, SHARE_LINK_WARNING_LENGTH } from "../../utilities/shareLink";

export const ShareButton: React.FC = () => {
    const toaster = useRef<OverlayToaster>(null);
    const initialShareHandled = useRef(false);
    const [copying, setCopying] = useState(false);

    useEffect(() => {
        if (initialShareHandled.current) return;
        initialShareHandled.current = true;

        if (INITIAL_SHARE_LINK.error) {
            toaster.current?.show(
                { message: INITIAL_SHARE_LINK.error, intent: "danger", icon: "error" },
                "invalid-share-link",
            );
        } else if (INITIAL_SHARE_LINK.code !== undefined) {
            const url = new URL(window.location.href);
            const params = new URLSearchParams(url.hash.slice(1));
            params.delete("code");
            url.hash = params.toString();
            window.history.replaceState(window.history.state, "", url.href);

            toaster.current?.show(
                { message: "Shared code loaded.", intent: "success", icon: "tick" },
                "share-link-loaded",
            );
        }
    }, []);

    const copyShareLink = async () => {
        setCopying(true);
        try {
            const link = createShareLink(useAppState.getState().wgsl, window.location.href);
            await navigator.clipboard.writeText(link);
            const isLong = link.length > SHARE_LINK_WARNING_LENGTH;
            toaster.current?.show({
                message: isLong
                    ? "Share link copied, but it is very long and may not work in some browsers or messaging apps."
                    : "Share link copied to clipboard.",
                intent: isLong ? "warning" : "success",
                icon: isLong ? "warning-sign" : "tick",
            });
        } catch {
            toaster.current?.show({
                message: "Could not copy the share link. Check your browser’s clipboard permissions and try again.",
                intent: "danger",
                icon: "error",
            });
        } finally {
            setCopying(false);
        }
    };

    return (
        <>
            <Tooltip content="Copy share link" position="bottom">
                <Button
                    icon="document-share"
                    variant="minimal"
                    aria-label="Copy share link"
                    disabled={copying}
                    onClick={copyShareLink}
                />
            </Tooltip>
            <OverlayToaster ref={toaster} position="top" maxToasts={3} />
        </>
    );
};
