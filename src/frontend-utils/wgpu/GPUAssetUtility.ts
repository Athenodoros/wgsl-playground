import { range } from "../general/data";

export type GPUAssetBinding = GPUAssetBuffer | GPUAssetTexture;

export interface GPUAssetBuffer {
    type: "buffer";
    buffer: GPUBuffer;
    binding: GPUBufferBindingType;
}

export interface GPUAssetTexture {
    type: "texture";
    texture: GPUTexture;
    view: GPUTextureView;
}

type GPUCommand = (commandEncoder: GPUCommandEncoder) => void;

export class GPUAssetUtility {
    device: GPUDevice;

    constructor(device: GPUDevice) {
        this.device = device;
    }

    getUint32Buffer(type: GPUBufferBindingType, values: number[] | Uint32Array, usage?: number): GPUAssetBuffer;
    getUint32Buffer(type: GPUBufferBindingType, lengthInBytes: number, usage?: number): GPUAssetBuffer;
    getUint32Buffer(
        type: GPUBufferBindingType,
        lengthOrValues: number | number[] | Uint32Array,
        rawUsage: number = 0
    ): GPUAssetBuffer {
        return this.getBufferWithUsage(type, lengthOrValues, rawUsage, Uint32Array);
    }

    getFloat32Buffer(type: GPUBufferBindingType, values: number[] | Float32Array, usage?: number): GPUAssetBuffer;
    getFloat32Buffer(type: GPUBufferBindingType, lengthInBytes: number, usage?: number): GPUAssetBuffer;
    getFloat32Buffer(
        type: GPUBufferBindingType,
        lengthOrValues: number | number[] | Float32Array,
        rawUsage: number = 0
    ): GPUAssetBuffer {
        return this.getBufferWithUsage(type, lengthOrValues, rawUsage, Float32Array);
    }

    private getBufferWithUsage(
        type: GPUBufferBindingType,
        lengthOrValues: number | number[] | Float32Array | Uint32Array,
        rawUsage: number,
        ArrayType: Float32ArrayConstructor | Uint32ArrayConstructor
    ): GPUAssetBuffer {
        // Set usage flags
        let usage = rawUsage | GPUBufferUsage.COPY_SRC;
        if (type === "uniform") usage |= GPUBufferUsage.UNIFORM;
        else usage |= GPUBufferUsage.STORAGE;
        if (Array.isArray(lengthOrValues) || lengthOrValues instanceof Float32Array) usage |= GPUBufferUsage.COPY_DST;

        // Get buffer details
        const length = typeof lengthOrValues === "number" ? lengthOrValues : lengthOrValues.length;
        const buffer = this.device.createBuffer({ size: length * 4, usage }); // 4 bytes per float32/uint32

        // Copy values to buffer
        if (lengthOrValues instanceof ArrayType) this.device.queue.writeBuffer(buffer, 0, lengthOrValues);
        else if (Array.isArray(lengthOrValues)) this.device.queue.writeBuffer(buffer, 0, new ArrayType(lengthOrValues));

        // Return asset
        return { type: "buffer", buffer, binding: type };
    }

    getTextureView(width: number, height: number): GPUAssetTexture {
        const texture = this.device.createTexture({
            size: { width, height },
            format: "rgba8unorm",
            usage:
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.STORAGE_BINDING |
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_SRC,
        });
        return { type: "texture", texture, view: texture.createView() };
    }

    getCanvasContext(canvas: HTMLCanvasElement): GPUCanvasContext {
        const context = canvas.getContext("webgpu");
        if (!context) throw Error("No GPU context available");
        context.configure({ device: this.device, format: "bgra8unorm", alphaMode: "opaque" });
        return context;
    }

    run(...commands: GPUCommand[]): void {
        const commandEncoder = this.device.createCommandEncoder();
        for (const command of commands) command(commandEncoder);
        this.device.queue.submit([commandEncoder.finish()]);
    }

    getCommandRunner(...commands: GPUCommand[]): () => void {
        return () => {
            const commandEncoder = this.device.createCommandEncoder();
            for (const command of commands) command(commandEncoder);
            this.device.queue.submit([commandEncoder.finish()]);
        };
    }

    async getTextureValues(texture: GPUTexture) {
        const rawBytesPerRow = texture.width * 16; // sizeof(vec4<f32>) = 16 bytes
        const bytesPerRow = Math.ceil(rawBytesPerRow / 256) * 256; // Ensure 256-byte alignment
        const textureData = this.device.createBuffer({
            size: bytesPerRow * texture.height,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const commandEncoder = this.device.createCommandEncoder();
        commandEncoder.copyTextureToBuffer(
            { texture: texture, origin: { x: 0, y: 0, z: 0 } },
            { buffer: textureData, bytesPerRow, rowsPerImage: texture.height },
            { width: texture.width, height: texture.height }
        );
        this.device.queue.submit([commandEncoder.finish()]);

        await textureData.mapAsync(GPUMapMode.READ);
        const array = [...new Uint8Array(textureData.getMappedRange())];
        textureData.unmap();
        textureData.destroy();

        // Top to bottom, then left to right
        return range(texture.height).map((rowIdx) => {
            const row = array.slice(rowIdx * bytesPerRow, (rowIdx + 1) * bytesPerRow);
            return range(texture.width).map((colIdx) => {
                const start = colIdx * 4;
                return row.slice(start, start + 4) as [number, number, number, number];
            });
        });
    }

    async getBufferValues(buffer: GPUBuffer) {
        const destination = this.device.createBuffer({
            size: buffer.size,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });
        const commandEncoder = this.device.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(buffer, 0, destination, 0, buffer.size);
        this.device.queue.submit([commandEncoder.finish()]);

        await destination.mapAsync(GPUMapMode.READ);
        return new Float32Array(destination.getMappedRange());
    }
}
