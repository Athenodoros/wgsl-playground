/**
 * A shader can ask for the panels about its code to start collapsed, on a line of its own:
 *
 *     // playground-collapse-sections
 *
 * That leaves its outputs as nearly all there is to see - for a shader that is mostly a picture, like
 * a simulation, whose structs and bindings are details to open once the picture has been seen. Like the
 * run order, it is about the file as a whole rather than any one declaration in it.
 */
const COLLAPSE_SECTIONS = "playground-collapse-sections";

/** Whether a shader asks for the struct, binding and run panels to start collapsed. */
export const hasCollapseSections = (wgsl: string): boolean =>
    wgsl.split("\n").some((line) => line.trim().match(/^\/\/\/?\s*(.*)$/)?.[1]?.trim() === COLLAPSE_SECTIONS);
