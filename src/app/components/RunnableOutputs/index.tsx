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
                <NonIdealState icon="bug" title="Parsing Error" description={<pre>{parseError}</pre>} />
            </SectionCard>
        );
    }

    return (
        <SectionCard padded={false} className="my-4 flex flex-col gap-4">
            <OutputCanvas hidden={output?.type !== "render" || (results !== null && results.type !== "outputs")} />
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
