import React from "react";
import { WgslTextureBinding } from "../../utilities/types";
import { VariableHeader } from "./VariableDisplay";

/**
 * A storage texture in the bindings panel. It is shown rather than edited: the texture never leaves
 * the GPU, so there is no value here to change, and the size comes from the directive comment on the
 * declaration. What the shader writes into it goes to the output canvas instead.
 */
export const TextureBindingDisplay: React.FC<{ binding: WgslTextureBinding }> = ({ binding }) => (
    <div className="mr-4">
        <VariableHeader
            title={binding.name}
            subtitle={`(Group ${binding.group}, Binding ${binding.index})`}
            type={binding.type}
        />
        <p className="ml-4 !mb-0 text-sm text-gray-500 italic">
            {binding.width} × {binding.height} texels, written on the GPU and drawn on the canvas.
        </p>
    </div>
);
