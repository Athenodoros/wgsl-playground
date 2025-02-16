import { WgslReflect } from "wgsl_reflect";
import { create } from "zustand";

interface AppState {
    wgsl: string;
    parsed:
        | {
              type: "reflection";
              reflection: WgslReflect;
          }
        | {
              type: "error";
              error: string;
          };
}

interface AppActions {
    setWGSL: (wgsl: string | undefined) => void;
}

export const DEFAULT_WGSL_CODE: string = `@group(0) @binding(0) var<uniform> scene: Scene;
@group(0) @binding(1) var<storage, read> toxels: array<Toxel>; // 1 per toxel
@group(0) @binding(2) var<storage, read_write> points: array<vec3f>; // 6 per facet (48 per toxel)
@group(0) @binding(3) var<storage, read> triangle_counts: array<i32>; // 1 per facet (8 per toxel) - count per cube facet
@group(0) @binding(4) var<storage, read> centroids: array<vec3f>; // 1 per toxel - centroid per projected volume
@group(0) @binding(5) var<storage, read_write> facet_colours: array<vec3f>; // 1 per facet - colour per face

struct Scene {
    viewport4d: array<vec4<f32>, 4>,
    timestamp: f32,
    viewport2d: mat4x4<f32>,
    half_dimensions: array<vec4<f32>, 4>, // Diagonal matrix
}

struct Toxel {
    center: vec4<f32>,
    colour: vec3<f32>,
}

@compute @workgroup_size(1,1,1) // One per facet per toxel (ie. 8 per toxel)
fn get_faces(@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>) {
    // Get indices for this thread
    let toxel_index = i32(GlobalInvocationID.x * 128 + GlobalInvocationID.y);
    if (toxel_index >= i32(arrayLength(&toxels))) { return; }

    let facet_index = i32(GlobalInvocationID.z);
    let total_facet_index = toxel_index * 8 + facet_index;
    let points_index = total_facet_index * 6;

    // Get info from buffers
    let toxel = toxels[toxel_index];
    let triangle_count = triangle_counts[total_facet_index];
    let point_count = triangle_count + 2;
    let solid_centroid = centroids[toxel_index];

    if (triangle_count == 0) {
        return;
    }

    // Get normal and face centroid
    var face_centroid = vec3f(0, 0, 0);
    for (var i = 0; i < point_count; i++) {
        face_centroid += points[points_index + i];
    }
    face_centroid /= f32(point_count);

    var normal = normalize(cross(points[points_index + 1] - points[points_index], points[points_index + 2] - points[points_index]));
    if (dot(normal, face_centroid - solid_centroid) < 0.0) {
        normal *= -1;
    }

    // Get signed angles for each point, relative to the face centroid and normal
    var signed_angles = array<f32, 6>();
    var reference_vector = points[points_index] - face_centroid;    
    for (var i = 0; i < point_count; i++) {
        let vector = points[points_index + i] - face_centroid;
        let angle = atan2(dot(cross(reference_vector, vector), normal), dot(reference_vector, vector));
        signed_angles[i] = angle;
    }

    // Sort points so that they are in clockwise order around the centroid
    for (var i = 0; i < point_count; i++) {
        for (var j = i + 1; j < point_count; j++) {
            if (signed_angles[i] > signed_angles[j]) {
                let temp = points[points_index + i];
                points[points_index + i] = points[points_index + j];
                points[points_index + j] = temp;

                let temp_angle = signed_angles[i];
                signed_angles[i] = signed_angles[j];
                signed_angles[j] = temp_angle;
            }
        }
    }

    // Project points to screen space
    for (var i = 0; i < point_count; i++) {
        points[points_index + i] = project_3d_to_screen(points[points_index + i]);
    }

    // Store colour for facet
    facet_colours[total_facet_index] = toxel.colour * (normal.y / 3 + 0.66);
}

fn project_3d_to_screen(point: vec3<f32>) -> vec3<f32> {
    let point2d = scene.viewport2d * vec4f(point, 1.0);
    return point2d.xyz / point2d.w;
}
`;

const getReflection = (wgsl: string): AppState["parsed"] => {
    try {
        const reflection = new WgslReflect(wgsl);
        (window as any).reflection = reflection;
        return { type: "reflection", reflection };
    } catch (e) {
        if ("message" in e && typeof e.message === "string") {
            return { type: "error", error: e.message };
        }
        return { type: "error", error: "Unknown error" };
    }
};

export const useAppState = create<AppState & AppActions>()((set) => ({
    wgsl: DEFAULT_WGSL_CODE,
    parsed: getReflection(DEFAULT_WGSL_CODE),
    setWGSL: (wgsl?: string) => set({ wgsl, parsed: getReflection(wgsl ?? "") }),
}));
