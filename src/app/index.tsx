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
                <div className="flex p-4 gap-4 items-stretch h-screen pt-16.5">
                    <WGSLEditor />
                    <div className="w-2xl flex flex-col gap-4 overflow-y-auto -m-px p-px">
                        <StructDisplay />
                        <BindingsDisplay />
                        {/* A running loop can still be paused or reset with this section closed, from its header. */}
                        <RightSection
                            title="Function Runner"
                            icon="flow-end"
                            collapsedHeaderElement={looping ? <PlaybackButtons /> : undefined}
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
