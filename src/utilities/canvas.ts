/**
 * The output canvas' size in CSS pixels. Its backing store is `devicePixelRatio` times larger, so
 * anything measured in real pixels has to scale these - see `OutputCanvas`.
 *
 * A storage texture with no size of its own is made this big, so that what a compute shader writes
 * lands on the canvas one texel to one CSS pixel.
 */
export const OUTPUT_CANVAS_WIDTH = 640;
export const OUTPUT_CANVAS_HEIGHT = 360;
