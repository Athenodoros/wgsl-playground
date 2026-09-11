import defaultVertexShader from "../examples/default_vertex_shader.wgsl";
import { parseWGSL } from "../utilities/parseWGSL";
import { readShareLink } from "../utilities/shareLink";
import { AppState } from "./types";

const parsed = parseWGSL(defaultVertexShader);
if (parsed.type === "failed-parse") {
    throw new Error(parsed.error);
}

export const INITIAL_SHARE_LINK = readShareLink(window.location.hash);

export const INITIAL_APP_STATE: AppState = {
    ...parsed,
    type: "loading",
    wgsl: INITIAL_SHARE_LINK.code ?? defaultVertexShader,
};
