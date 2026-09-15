import { Attribute } from "wgsl_reflect";

/**
 * A uniform the playground fills in itself, with the seconds since the frame before, marked by a
 * comment on its declaration:
 *
 *     @group(0) @binding(0) var<uniform> delta_time: f32; // playground-time
 *
 * It is what a shader run in a loop advances by. Anything worth keeping between frames - the time
 * elapsed so far, say - is the shader's to accumulate in a storage buffer of its own, so the one
 * value the playground has to supply stays the one the shader cannot work out.
 */

const TIME_MARKER = "playground-time";

/** Whether a declaration's attributes carry the time marker comment. */
export const hasTimeMarker = (attributes: Attribute[] | null, wgsl: string): boolean => {
    const codeLines = wgsl.split("\n");

    return (
        attributes?.some((attribute) => codeLines[attribute.line - 1]?.match(/\/\/\/?(.*)/)?.[1]?.trim() === TIME_MARKER) ??
        false
    );
};

export const TIME_MARKER_WARNING = `\`${TIME_MARKER}\` only fills a \`var<uniform>\` of type \`f32\`, so it is ignored here`;
