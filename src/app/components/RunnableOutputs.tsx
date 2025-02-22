import { NonIdealState, SectionCard } from "@blueprintjs/core";
import { noop } from "../../frontend-utils/general/data";
import { useAppState } from "../../state";
import { Runnable } from "../../utilities/types";
import { VariableDisplay } from "./VariableDisplay";

export const RunnableOutputs: React.FC<{ output: Runnable | null }> = ({ output }) => {
    const setCanvas = useAppState((state) => state.setCanvas);
    const results = useAppState((state) => (state.type === "finished" ? state.results : null));
    const device = useAppState((state) => state.device);

    if (device === null)
        return (
            <SectionCard padded={true}>
                <NonIdealState
                    icon="th-disconnect"
                    title="WebGPU Not Available"
                    description="WebGPU is not available in your browser. Please try Chrome, or Firefox Nightly."
                    className="my-16"
                />
            </SectionCard>
        );

    return (
        <SectionCard padded={false} className="my-4">
            <canvas className={output?.type === "render" ? "h-16 w-16" : "hidden"} ref={setCanvas} />
            {results?.map((result) => (
                <VariableDisplay
                    key={result.binding.id}
                    binding={result.binding}
                    value={result.value}
                    isError={false}
                    onChange={noop}
                    readOnly={true}
                />
            ))}
        </SectionCard>
    );
};
