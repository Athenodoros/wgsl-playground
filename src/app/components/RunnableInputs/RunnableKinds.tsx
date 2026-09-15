import { SegmentedControl } from "@blueprintjs/core";
import React from "react";
import { defaultTargetOfKind } from "../../../utilities/runTarget";
import { RunTarget, Runnable } from "../../../utilities/types";

const KINDS: { value: Runnable["type"]; label: string }[] = [
    { value: "render", label: "Render" },
    { value: "compute", label: "Compute" },
    { value: "function", label: "Function" },
];

/**
 * Picks what kind of thing to run, out of the kinds this shader has.
 *
 * A kind with nothing in it is offered but disabled, so that what a shader cannot do stays visible
 * rather than disappearing - which is what tells you that a file has no render pass, as against the
 * control having been built differently. Nothing is selected when the target is empty, since
 * clearing is a choice the segmented control has no way to express itself.
 *
 * Switching kind lands on the first runnable of it - or, for compute, on the shader's run order if it
 * declares one - and the picker below chooses among the rest.
 */
export const RunnableKinds: React.FC<{
    options: Runnable[];
    runOrder: string[] | null;
    target: RunTarget;
    setRunTarget: (target: RunTarget) => void;
}> = ({ options, runOrder, target, setRunTarget }) => (
    <SegmentedControl
        // Blueprint fills the control in; `outlined` is the same background and border the button
        // this replaced used, so the section keeps the shape it had.
        className="!bg-transparent border-solid border-[length:var(--bp-surface-border-width)] border-[color:var(--bp-surface-border-color-strong)]"
        intent="primary"
        size="small"
        options={KINDS.map(({ value, label }) => ({
            value,
            label,
            disabled: !options.some((runnable) => runnable.type === value),
        }))}
        value={target.type}
        onValueChange={(value) => {
            // Blueprint reports a click on the kind already selected as a change too, and treating it
            // as one would throw away the chain and any counts edited by hand for nothing.
            const kind = KINDS.find((entry) => entry.value === value)?.value;
            if (kind === undefined || kind === target.type) return;

            setRunTarget(defaultTargetOfKind(options, kind, runOrder));
        }}
    />
);
