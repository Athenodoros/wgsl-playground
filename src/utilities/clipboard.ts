/**
 * Copies text that is still being worked out, such as a buffer being read back from the GPU.
 *
 * Some browsers only let a page write to the clipboard during the click that asked for it, and a read
 * back can take longer than that, so the write starts straight away with the text to follow. Browsers
 * without `ClipboardItem` are given the text once it is ready.
 */
export const copyText = async (text: Promise<string>) => {
    if (typeof ClipboardItem === "undefined") {
        await navigator.clipboard.writeText(await text);
        return;
    }

    const blob = text.then((value) => new Blob([value], { type: "text/plain" }));
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
};
