import { WgslBufferBinding } from "./types";

/**
 * Buffers longer than this many rows are summarised rather than shown as text.
 *
 * Nobody reads or edits a value that long by hand, and a text editor tall enough to hold it is slow
 * to render - so slow, for a simulation's state, that it stops the page responding. What is left is
 * the length, and copying or pasting the values whole.
 */
export const LARGE_BUFFER_ROWS = 20;

/** Buffers up to this many rows can still be shown as text on request. Past it, only copying is offered. */
export const RENDERABLE_BUFFER_ROWS = 200;

/** The length of a buffer binding's value, which is fixed by its input: the GPU never resizes a buffer. */
export const getBufferLength = (binding: WgslBufferBinding) => binding.type.getLength(binding.buffer.byteLength);

export const isLargeBuffer = (binding: WgslBufferBinding) =>
    !binding.time && getBufferLength(binding).rows > LARGE_BUFFER_ROWS;

export const canRenderBuffer = (binding: WgslBufferBinding) => getBufferLength(binding).rows <= RENDERABLE_BUFFER_ROWS;

/** How long a buffer is, in words: its elements if it is an array, and its rows otherwise. */
export const describeBufferLength = (binding: WgslBufferBinding) => {
    const { rows, elements } = getBufferLength(binding);
    return elements !== null
        ? `${elements.toLocaleString("en")} ${elements === 1 ? "element" : "elements"}`
        : `${rows.toLocaleString("en")} rows`;
};
