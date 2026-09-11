/**
 * The grammar of directive comments.
 *
 *     list   := item ("," item)*
 *     item   := number "*" item        an array of that many elements
 *            |  "(" list ")"           a nested struct, vector, matrix or array
 *            |  "rand" "(" n "," n ")" a random value in a range
 *            |  number
 *
 * Nesting is explicit: a group's parentheses mark a compound value, so `(1, 2, 3), (4, 5, 6)` is
 * two three-component values and `1, 2, 3, 4, 5, 6` is six single ones. Nothing is inferred from
 * the type being filled, which is what makes a directive readable on its own.
 */
export type DirectiveNode =
    | { type: "value"; value: number }
    | { type: "rand"; min: number; max: number }
    | { type: "group"; items: DirectiveNode[] }
    | { type: "repeat"; count: number; item: DirectiveNode };

type Token = { type: "number"; value: number } | { type: "rand" | "(" | ")" | "," | "*" };

const TOKEN_PATTERN = /\s*(?:(rand)|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)|([(),*]))/y;

const tokenize = (input: string): Token[] | string => {
    const raw = input.trim();
    const tokens: Token[] = [];
    TOKEN_PATTERN.lastIndex = 0;

    while (TOKEN_PATTERN.lastIndex < raw.length) {
        const start = TOKEN_PATTERN.lastIndex;
        const match = TOKEN_PATTERN.exec(raw);
        if (match === null) return `unexpected \`${raw.slice(start).trim().match(/^[^\s(),*]*/)?.[0]}\``;

        const [, rand, number, symbol] = match;
        if (rand !== undefined) tokens.push({ type: "rand" });
        else if (number !== undefined) tokens.push({ type: "number", value: Number(number) });
        else tokens.push({ type: symbol as "(" | ")" | "," | "*" });
    }

    return tokens;
};

/**
 * Parses a directive comment, or returns a message explaining why it is not one. Both outcomes are
 * useful: the caller warns on a comment that was meant as a directive and failed, and stays quiet
 * about one that was never a directive at all.
 */
export const parseDirective = (comment: string): { type: "directive"; items: DirectiveNode[] } | { type: "error"; error: string } => {
    const tokens = tokenize(comment);
    if (typeof tokens === "string") return { type: "error", error: tokens };
    if (tokens.length === 0) return { type: "error", error: "empty directive" };

    let index = 0;
    const peek = () => tokens[index];
    const take = () => tokens[index++];

    const parseItem = (): DirectiveNode | string => {
        const token = take();
        if (token === undefined) return "unexpected end of directive";

        if (token.type === "number") {
            // `3 * item` repeats, and is expanded into the list it sits in.
            if (peek()?.type === "*") {
                take();
                if (!Number.isInteger(token.value) || token.value < 1)
                    return `repeat count must be a whole number of at least 1, got ${token.value}`;

                const item = parseItem();
                if (typeof item === "string") return item;
                return { type: "repeat", count: token.value, item };
            }

            return { type: "value", value: token.value };
        }

        if (token.type === "rand") {
            if (take()?.type !== "(") return "`rand` must be followed by `(min, max)`";
            const min = take();
            if (min?.type !== "number") return "`rand` needs a number for its minimum";
            if (take()?.type !== ",") return "`rand` needs two arguments, separated by a comma";
            const max = take();
            if (max?.type !== "number") return "`rand` needs a number for its maximum";
            if (take()?.type !== ")") return "`rand` takes exactly two arguments";

            return { type: "rand", min: min.value, max: max.value };
        }

        if (token.type === "(") {
            const items = parseList();
            if (typeof items === "string") return items;
            if (take()?.type !== ")") return "unclosed `(`";

            return { type: "group", items };
        }

        return `unexpected \`${token.type}\``;
    };

    const parseList = (): DirectiveNode[] | string => {
        const items: DirectiveNode[] = [];
        for (;;) {
            const item = parseItem();
            if (typeof item === "string") return item;
            items.push(item);

            if (peek()?.type !== ",") return items;
            take();
        }
    };

    const items = parseList();
    if (typeof items === "string") return { type: "error", error: items };
    if (index < tokens.length) {
        const leftover = tokens[index];
        return {
            type: "error",
            error:
                leftover.type === ")"
                    ? "unmatched `)`"
                    : `unexpected \`${leftover.type === "number" ? leftover.value : leftover.type}\` - values are separated by commas`,
        };
    }

    return { type: "directive", items };
};

