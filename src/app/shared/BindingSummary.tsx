import { Button, Tooltip } from "@blueprintjs/core";
import React, { ReactNode } from "react";
import { WgslBinding } from "../../utilities/types";
import { getBindingSubtitle } from "./bindingSubtitle";
import { VariableHeader } from "./VariableDisplay";

/**
 * A binding shown by what it is rather than by its value: the time the playground fills in, a texture
 * that never leaves the GPU, or a buffer too long to show as text. A line says what it holds, the info
 * button why there is no value to see, and any actions offer what can be done with it instead.
 */
export const BindingSummary: React.FC<{
    binding: WgslBinding;
    info: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
}> = ({ binding, info, actions, children }) => (
    <div className="mr-4">
        <VariableHeader title={binding.name} subtitle={getBindingSubtitle(binding)} type={binding.type} />
        <div className="ml-4 flex flex-wrap items-center gap-x-1 gap-y-2">
            <p className="!mb-0 text-xs text-slate-600">{children}</p>
            <Tooltip content={<div className="max-w-xs">{info}</div>} position="top">
                <Button variant="minimal" size="small" icon="info-sign" aria-label={`About ${binding.name}`} />
            </Tooltip>
            {actions ? <div className="ml-auto flex gap-2">{actions}</div> : null}
        </div>
    </div>
);
