import uid from 'scratch-vm/src/util/uid.js';
import compress from 'scratch-vm/src/serialization/tw-compress-sb3.js';
import {normalizeColor, COLOR_COMMENT_HEADER, COLOR_COMMENT_MARKER} from './project-block-colors';

export const COLOR_METADATA_KEY = 'scratchGuiColors';
export const COLOR_TRANSFER_MARKER = ' // _twcolors_transfer_';
const kinds = ['variables', 'lists', 'procedures', 'parameters'];
const empty = () => ({variables: {}, lists: {}, procedures: {}, parameters: {}});
const commentText = comment => comment.text + (typeof comment.extraText === 'string' ? comment.extraText : '');
// Match sb3.serializeComments: upstream accepts at most 8000 characters in text.
const setCommentText = (comment, text) => {
    comment.text = text.slice(0, 8000);
    if (text.length > 8000) comment.extraText = text.slice(8000);
    else delete comment.extraText;
    return comment;
};
export const sanitizeColors = source => {
    const result = empty();
    if (!source || typeof source !== 'object') return result;
    for (const kind of kinds) {
        for (const [id, entry] of Object.entries(source[kind] || {})) {
            const color = normalizeColor(entry && entry.color);
            if (color) {
                const colors = {};
                for (const name of ['secondary', 'tertiary', 'quaternary', 'text']) {
                    const value = normalizeColor(entry.colors && entry.colors[name]);
                    if (value) colors[name] = value;
                }
                Object.defineProperty(result[kind], id, {enumerable: true,
                    configurable: true,
                    writable: true,
                    value: {color,
                        ...(Object.keys(colors).length ? {colors} : {}),
                        ...(typeof entry.definitionId === 'string' ? {definitionId: entry.definitionId} : {}),
                        ...(typeof entry.name === 'string' ? {name: entry.name} : {}),
                        ...(typeof entry.code === 'string' ? {code: entry.code} : {})}});
            }
        }
    }
    return result;
};
export const hasColors = colors => kinds.some(kind => Object.keys(colors[kind]).length);
const merge = (base, incoming) => {
    for (const kind of kinds) {
        for (const [id, entry] of Object.entries(incoming[kind])) {
            Object.defineProperty(base[kind], id,
                {value: entry, enumerable: true, writable: true, configurable: true});
        }
    }
    return base;
};
export const transferComment = colors => setCommentText({
    blockId: null,
    x: 50,
    y: 50,
    width: 400,
    height: 180,
    minimized: true
}, `${COLOR_COMMENT_HEADER}\n${JSON.stringify({version: 1, ...colors})}${COLOR_TRANSFER_MARKER}`);
export const readTransferColors = payload => {
    const colors = empty();
    if (!payload || typeof payload !== 'object') return colors;
    const containers = payload.targets || [payload];
    for (const marker of [COLOR_TRANSFER_MARKER, COLOR_COMMENT_MARKER]) {
        for (const comment of containers.flatMap(container => Object.values(container.comments || {}))) {
            if (typeof comment.text !== 'string') continue;
            const text = commentText(comment);
            if (!text.endsWith(marker)) continue;
            try {
                const line = text.split('\n').pop();
                merge(colors, sanitizeColors(JSON.parse(line.slice(0, -marker.length))));
            } catch (e) { /* Fall back to the other representation. */ }
        }
    }
    // Explicit, valid metadata has higher priority than the comment, entry by entry.
    for (const container of [payload, ...containers]) {
        merge(colors, sanitizeColors(container[COLOR_METADATA_KEY]));
    }
    return colors;
};
export const attachTransferColors = (payload, colors) => {
    payload = JSON.parse(JSON.stringify(payload));
    colors = sanitizeColors(colors);
    if (!hasColors(colors)) return payload;
    // TurboWarp already supports this envelope for standalone blocks with extension URLs.
    if (Array.isArray(payload)) payload = {blocks: payload, extensionURLs: {}};
    payload[COLOR_METADATA_KEY] = {version: 1, ...colors};
    const container = payload.targets ? payload.targets.find(target => target.isStage) : payload;
    if (container && !payload.targets) {
        container.comments = {...container.comments};
        for (const [id, comment] of Object.entries(container.comments)) {
            if (comment.text && commentText(comment).endsWith(COLOR_TRANSFER_MARKER)) delete container.comments[id];
        }
        container.comments[uid()] = transferComment(colors);
    }
    return payload;
};

// Use the VM's optimizer itself. It changes keys and references in place while
// retaining block objects, which lets us recover its exact runtime-to-saved ID map.
export const compressProjectColors = payload => {
    const originalIds = new WeakMap();
    for (const target of payload.targets) {
        for (const [id, block] of Object.entries(target.blocks)) originalIds.set(block, id);
    }
    compress(payload);
    const blockIds = new Map();
    for (const target of payload.targets) {
        for (const [id, block] of Object.entries(target.blocks)) blockIds.set(originalIds.get(block), id);
    }
    const remap = data => {
        const colors = sanitizeColors(data);
        colors.procedures = Object.fromEntries(Object.entries(colors.procedures)
            .map(([id, entry]) => [blockIds.get(id) || id, entry]));
        colors.parameters = Object.fromEntries(Object.entries(colors.parameters).map(([id, entry]) => {
            if (entry.definitionId) entry.definitionId = blockIds.get(entry.definitionId) || entry.definitionId;
            return [blockIds.get(id) || id, entry];
        }));
        return {...data, ...colors};
    };
    for (const container of [payload, ...payload.targets]) {
        if (container[COLOR_METADATA_KEY]) container[COLOR_METADATA_KEY] = remap(container[COLOR_METADATA_KEY]);
        for (const comment of Object.values(container.comments || {})) {
            if (typeof comment.text !== 'string') continue;
            const text = commentText(comment);
            const marker = [COLOR_COMMENT_MARKER, COLOR_TRANSFER_MARKER].find(value => text.endsWith(value));
            if (!marker) continue;
            try {
                const newline = text.lastIndexOf('\n');
                const data = JSON.parse(text.slice(newline + 1, -marker.length));
                setCommentText(comment, `${text.slice(0, newline + 1)}${JSON.stringify(remap(data))}${marker}`);
            } catch (e) { /* Preserve invalid or user-authored comment contents. */ }
        }
    }
    return payload;
};

// Single-sprite imports need fresh IDs so importing a second copy cannot recolor the original.
export const rekeySpriteColors = sprite => {
    const copy = JSON.parse(JSON.stringify(sprite));
    const colors = readTransferColors(copy);
    const blocks = Object.fromEntries(Object.keys(copy.blocks || {}).map(id => [id, uid()]));
    const variables = Object.fromEntries([...Object.keys(copy.variables || {}), ...Object.keys(copy.lists || {})]
        .map(id => [id, uid()]));
    for (const block of Object.values(copy.blocks || {})) {
        if (Array.isArray(block)) {
            if ((block[0] === 12 || block[0] === 13) && variables[block[2]]) block[2] = variables[block[2]];
            continue;
        }
        if (block.parent) block.parent = blocks[block.parent];
        if (block.next) block.next = blocks[block.next];
        for (const input of Object.values(block.inputs || {})) {
            for (let index = 1; index < input.length; index++) {
                if (typeof input[index] === 'string') input[index] = blocks[input[index]] || input[index];
                else if (Array.isArray(input[index]) && (input[index][0] === 12 || input[index][0] === 13)) {
                    input[index][2] = variables[input[index][2]] || input[index][2];
                }
            }
        }
        for (const field of Object.values(block.fields || {})) {
            if (Array.isArray(field) && variables[field[1]]) field[1] = variables[field[1]];
        }
    }
    copy.blocks = Object.fromEntries(Object.entries(copy.blocks || {}).map(([id, block]) => [blocks[id], block]));
    for (const kind of ['variables', 'lists']) {
        copy[kind] = Object.fromEntries(Object.entries(copy[kind] || {}).map(([id, entry]) => [variables[id], entry]));
    }
    for (const [id, comment] of Object.entries(copy.comments || {})) {
        if (comment.text && commentText(comment).endsWith(COLOR_TRANSFER_MARKER)) delete copy.comments[id];
        else if (comment.blockId) comment.blockId = blocks[comment.blockId] || comment.blockId;
    }
    const remapped = empty();
    for (const kind of kinds) {
        const mapping = kind === 'procedures' || kind === 'parameters' ? blocks : variables;
        for (const [id, entry] of Object.entries(colors[kind])) {
            if (kind === 'parameters') entry.definitionId = blocks[entry.definitionId] || entry.definitionId;
            Object.defineProperty(remapped[kind], mapping[id] || id,
                {value: entry, enumerable: true, writable: true, configurable: true});
        }
    }
    return {sprite: copy, colors: remapped};
};
