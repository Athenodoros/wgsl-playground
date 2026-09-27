import { WgslBufferBinding } from "./types";

/**
 * Buffers too long to read are summarised rather than shown as text.
 *
 * Nobody reads or edits a value that long by hand, and a text editor tall enough to hold it is slow
 * to render - so slow, for a simulation's state, that it stops the page responding. What is left is
 * the length, and copying or pasting the values whole.
 *
 * Length is measured in rows, one per array element or struct member, and in the text itself: a few
 * rows can still be a long blob, and an output is written on a single line however long it is.
 */
export const LARGE_BUFFER_ROWS = 20;
export const LARGE_TEXT_CHARS = 10_000;
export const LARGE_LINE_CHARS = 2_000;

/** Buffers up to this long can still be shown as text on request. Past it, only copying is offered. */
export const RENDERABLE_BUFFER_ROWS = 200;
export const RENDERABLE_TEXT_CHARS = 100_000;

/**
 * The fewest characters a value takes written out, separator included - `0,` - which is what lets a
 * buffer's size say it is too long before any of it is written out.
 */
const MIN_VALUE_CHARS = 2;

const getMinimumTextLength = (binding: WgslBufferBinding) => (binding.buffer.byteLength / 4) * MIN_VALUE_CHARS;

/** The length of a buffer binding's value, which is fixed by its input: the GPU never resizes a buffer. */
export const getBufferLength = (binding: WgslBufferBinding) => binding.type.getLength(binding.buffer.byteLength);

/**
 * Whether a buffer is too long to show as text, checking the cheapest things first: its size, which
 * can settle it without writing anything out, then its rows, then the text - if there is any yet. A
 * buffer that has not been read back is judged by the first two alone.
 */
export const isLargeBuffer = (binding: WgslBufferBinding, text: string | null = null) => {
    if (binding.time) return false;
    if (getMinimumTextLength(binding) > LARGE_TEXT_CHARS) return true;
    if (getBufferLength(binding).rows > LARGE_BUFFER_ROWS) return true;

    if (text === null || text.length <= LARGE_LINE_CHARS) return false;
    if (text.length > LARGE_TEXT_CHARS) return true;
    return text.split("\n").some((line) => line.length > LARGE_LINE_CHARS);
};

export const canRenderBuffer = (binding: WgslBufferBinding) =>
    getMinimumTextLength(binding) <= RENDERABLE_TEXT_CHARS && getBufferLength(binding).rows <= RENDERABLE_BUFFER_ROWS;

/** How long a buffer is, in words: its elements if it is an array, and its rows otherwise. */
export const describeBufferLength = (binding: WgslBufferBinding) => {
    const { rows, elements } = getBufferLength(binding);
    return elements !== null
        ? `${elements.toLocaleString("en")} ${elements === 1 ? "element" : "elements"}`
        : `${rows.toLocaleString("en")} rows`;
};
