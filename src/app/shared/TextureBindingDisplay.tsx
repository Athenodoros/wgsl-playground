import React from "react";
import { WgslTextureBinding } from "../../utilities/types";
import { BindingSummary } from "./BindingSummary";

/**
 * A storage texture in the bindings panel. It is shown rather than edited: the texture never leaves
 * the GPU, so there is no value here to change, and the size comes from the directive comment on the
 * declaration. What the shader writes into it goes to the output canvas instead.
 */
export const TextureBindingDisplay: React.FC<{ binding: WgslTextureBinding }> = ({ binding }) => (
    <BindingSummary
        binding={binding}
        info="A storage texture never leaves the GPU, so there is nothing here to edit. Its size comes from the directive comment on its declaration, and what the shader writes to it is drawn on the canvas."
    >
        {binding.width} × {binding.height} texels
    </BindingSummary>
);
