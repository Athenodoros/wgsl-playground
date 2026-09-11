import { TemplateInfo, TypeInfo } from "wgsl_reflect";

/**
 * The storage texture formats the playground can create and put on the canvas.
 *
 * Every one of these is writable as a storage texture in core WebGPU, with no optional feature, and
 * reads back into an `f32` so the blit that displays it can be a single shader. The integer formats
 * (`rgba8uint` and friends) are left out because they would each need their own blit, and the ones
 * behind a feature flag because they are not there to be relied on.
 *
 * `sampleType` is what a bind group layout has to declare for the format. The 32-bit float formats
 * cannot be filtered, so they have to say so even though the blit only ever does a texel fetch.
 *
 * `inspectable` marks the formats the hover readout can read, which means the ones that are four
 * unsigned bytes per texel, matching what the canvas readback already produces.
 */
export const STORAGE_TEXTURE_FORMATS = {
    rgba8unorm: { sampleType: "float", inspectable: true },
    rgba8snorm: { sampleType: "float", inspectable: false },
    rgba16float: { sampleType: "float", inspectable: false },
    r32float: { sampleType: "unfilterable-float", inspectable: false },
    rg32float: { sampleType: "unfilterable-float", inspectable: false },
    rgba32float: { sampleType: "unfilterable-float", inspectable: false },
} satisfies Record<string, { sampleType: GPUTextureSampleType; inspectable: boolean }>;

export type StorageTextureFormat = keyof typeof STORAGE_TEXTURE_FORMATS;

const isSupportedFormat = (format: string): format is StorageTextureFormat => format in STORAGE_TEXTURE_FORMATS;

export type StorageTextureSupport =
    { type: "texture"; format: StorageTextureFormat } | { type: "error"; error: string };

/**
 * Whether a storage texture binding is one the playground can handle, and its format if so.
 *
 * Only two-dimensional, write-only textures are allowed. Reading from a storage texture is behind an
 * optional feature, and the other dimensionalities have nowhere to be displayed.
 */
export const getStorageTextureSupport = (type: TypeInfo): StorageTextureSupport => {
    if (type.name !== "texture_storage_2d")
        return { type: "error", error: `${type.name} not supported: only texture_storage_2d can be bound` };

    const template = type as TemplateInfo;

    const format = template.format?.name;
    if (format === undefined || !isSupportedFormat(format))
        return {
            type: "error",
            error: `${format ?? "that"} is not a storage texture format the playground can display, which are ${Object.keys(
                STORAGE_TEXTURE_FORMATS,
            ).join(", ")}`,
        };

    if (template.access !== "write")
        return {
            type: "error",
            error: `${template.access} storage textures are not supported, as reading one needs an optional WebGPU feature - use write`,
        };

    return { type: "texture", format };
};
