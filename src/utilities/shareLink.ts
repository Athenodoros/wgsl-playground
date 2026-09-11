// A conservative compatibility warning, not a hard limit on sharing.
export const SHARE_LINK_WARNING_LENGTH = 8_000;

export const createShareLink = (code: string, currentUrl: string): string => {
    const bytes = new TextEncoder().encode(code);
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const url = new URL(currentUrl);
    url.hash = `code=${encoded}`;
    return url.href;
};

export const readShareLink = (hash: string): { code?: string; error?: string } => {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    if (!params.has("code")) return {};

    try {
        const encoded = params.get("code")!;
        if (params.getAll("code").length !== 1 || !/^[A-Za-z0-9_-]*$/.test(encoded) || encoded.length % 4 === 1) {
            throw new Error("Invalid base64url");
        }
        const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        return { code: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) };
    } catch {
        return { error: "Could not load shared code: the link is malformed. Loaded the default example." };
    }
};
