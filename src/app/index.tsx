import { OverlaysProvider } from "@blueprintjs/core";
import { useAppState } from "../state";
import { AppNavbar } from "./components/AppNavbar";
import { BindingsDisplay } from "./components/BindingsDisplay";
import { RunnableInputs } from "./components/RunnableInputs";
import { PlaybackButtons } from "./components/RunnableInputs/PlaybackButtons";
import { RunnableOutputs } from "./components/RunnableOutputs";
import { StructDisplay } from "./components/StructDisplay";
import { WGSLEditor } from "./components/WGSLEditor";
import { RightSection } from "./shared/RightSection";
import { useUpdateDeviceState } from "./shared/useUpdateDeviceState";

export const App = () => {
    useUpdateDeviceState();
    const looping = useAppState(
        (state) => state.loop && (state.target.type === "compute" || state.target.type === "render"),
    );

    return (
        <div className="h-screen w-screen bg-slate-50 flex flex-col">
            <OverlaysProvider>
                <AppNavbar />
                {/* The space around the two columns belongs to them rather than to this row, so that the
                    right column scrolls from anywhere near it - above, below, to its right, and most of the
                    way across the gap to the editor - not only from over the sections themselves. */}
                <div className="flex items-stretch h-screen pt-12.5">
                    <div className="flex basis-md grow min-w-0 py-4 pl-4 pr-[0.2rem]">
                        <WGSLEditor />
                    </div>
                    {/* The sections keep the width they had when the column was 2xl wide with a pixel inset each
                        side, and the padding splits the gap to the editor four to one in this column's favour. */}
                    <div className="w-[calc(var(--container-2xl)-2px+1.8rem)] shrink-0 flex flex-col gap-4 overflow-y-auto py-4 pl-[0.8rem] pr-4">
                        <StructDisplay />
                        <BindingsDisplay />
                        {/* A running loop can still be paused or reset with this section closed, from its header. */}
                        <RightSection
                            title="Function Runner"
                            icon="flow-end"
                            collapsedHeaderElement={looping ? <PlaybackButtons /> : undefined}
                            followsCollapseComment
                        >
                            <RunnableInputs />
                        </RightSection>
                        {/* The output canvas lives in here, and a fresh one would have to start its run over -
                            throwing away everything a loop has built up. */}
                        <RightSection title="Outputs" icon="th" keepChildrenMounted>
                            <RunnableOutputs />
                        </RightSection>
                    </div>
                </div>
            </OverlaysProvider>
        </div>
    );
};
