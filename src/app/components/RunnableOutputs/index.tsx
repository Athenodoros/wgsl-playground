import { Callout, NonIdealState, SectionCard } from "@blueprintjs/core";
import { useAppState } from "../../../state";
import { BindingDisplay } from "../../shared/BindingDisplay";
import { VariableDisplay } from "../../shared/VariableDisplay";
import { OutputCanvas } from "./OutputCanvas";

export const RunnableOutputs: React.FC = () => {
    const parseError = useAppState((state) => (state.type === "failed-parse" ? state.error : null));
    const output = useAppState((state) => state.selected);
    const results = useAppState((state) => (state.type === "finished" ? state.results : null));
    const device = useAppState((state) => state.device);

    // A render runnable always draws to the canvas, and a compute one does when it writes a storage
    // texture - which goes there rather than into the outputs below, being far too big to read.
    const drawsToCanvas = useAppState(
        (state) =>
            state.selected?.type === "render" ||
            (state.selected?.type === "compute" && state.bindings.some((binding) => binding.kind === "texture"))
    );

    if (device === null) {
        return (
            <SectionCard padded={true}>
                <OutputCanvas hidden={true} />
                <NonIdealState
                    icon="th-disconnect"
                    title="WebGPU Not Available"
                    description="WebGPU is not available in your browser. Please try Chrome or Firefox Nightly."
                />
            </SectionCard>
        );
    }

    if (parseError) {
        return (
            <SectionCard padded={true}>
                <OutputCanvas hidden={true} />
                <NonIdealState
                    icon="bug"
                    title="Parsing Error"
                    // A parse error can be a sentence rather than a line of code - the list of
                    // storage texture formats, say - so it wraps instead of running off the side.
                    description={<pre className="whitespace-pre-wrap text-left">{parseError}</pre>}
                />
            </SectionCard>
        );
    }

    return (
        <SectionCard padded={false} className="my-4 flex flex-col gap-4">
            <OutputCanvas hidden={!drawsToCanvas || (results !== null && results.type !== "outputs")} />
            {results?.type === "errors"
                ? results.errors.map((error, idx) => (
                      <div className="mx-4" key={idx}>
                          <Callout key={idx} title={error.title} icon={error.icon} intent={error.intent}>
                              {error.text}
                          </Callout>
                      </div>
                  ))
                : results?.type === "outputs"
                ? results.bindings
                      .map((result) => (
                          <BindingDisplay
                              key={result.binding.id}
                              binding={result.binding}
                              value={result.value}
                              isError={false}
                          />
                      ))
                      .concat(
                          results.returned && output?.type === "function" && output.output
                              ? [
                                    <VariableDisplay
                                        key="function-output"
                                        title="Function Output"
                                        subtitle={output.name}
                                        type={output.output}
                                        value={results.returned.value}
                                        isError={false}
                                    />,
                                ]
                              : []
                      )
                : null}
        </SectionCard>
    );
};
