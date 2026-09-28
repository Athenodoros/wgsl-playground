import { Button, ButtonGroup, Tooltip } from "@blueprintjs/core";
import React from "react";
import { useAppState } from "../../../state";

/** Play or pause, and reset, for a target running in a loop. */
export const PlaybackButtons: React.FC = () => {
    const playing = useAppState((state) => state.playing);
    const play = useAppState((state) => state.play);
    const pause = useAppState((state) => state.pause);
    const reset = useAppState((state) => state.reset);

    // An error stays with the run it came from, so playing on would only stop again at once.
    const halted = useAppState(
        (state) => !state.playing && state.type === "finished" && state.results.type === "errors",
    );

    return (
        <ButtonGroup size="small" variant="outlined">
            <Tooltip content="Stopped on an error - reset to run again" position="bottom" disabled={!halted}>
                <Button
                    icon={playing ? "pause" : "play"}
                    intent="primary"
                    onClick={playing ? pause : play}
                    title={halted ? undefined : playing ? "Pause" : "Play"}
                    aria-label={playing ? "Pause" : "Play"}
                    disabled={halted}
                    // A disabled button gets no pointer events, which would leave the tooltip around it
                    // nothing to open on.
                    className={halted ? "pointer-events-none" : undefined}
                />
            </Tooltip>
            <Button icon="reset" onClick={reset} title="Reset" aria-label="Reset" />
        </ButtonGroup>
    );
};
