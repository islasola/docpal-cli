const BLOCK_TYPES = require('./mdxWriter').BLOCK_TYPES;

class BlockDiffer {
    constructor(options = {}) {
        this.matchBy = options.matchBy || 'position';
    }

    diff(existingBlocks, newBlocks) {
        const toUpdate = [];
        const toCreate = [];
        const toDelete = [];

        const existingPage = existingBlocks.find(b => b.block_type === 1);
        const newPage = newBlocks.find(b => b.block_type === 1);

        const existingChildren = existingPage ? (existingPage.children || []) : [];
        const newChildren = newPage ? (newPage.children || []) : [];

        if (this.matchBy === 'position') {
            this._diffByPosition(existingBlocks, newBlocks, existingChildren, newChildren, toUpdate, toCreate, toDelete);
        } else {
            this._diffByKey(existingBlocks, newBlocks, existingChildren, newChildren, toUpdate, toCreate, toDelete);
        }

        return { toUpdate, toCreate, toDelete };
    }

    _diffByPosition(existingBlocks, newBlocks, existingChildren, newChildren, toUpdate, toCreate, toDelete) {
        const existingById = this._blocksById(existingBlocks);
        const pageBlock = existingBlocks.find(b => b.block_type === 1);
        const parentId = pageBlock ? pageBlock.block_id : null;

        const maxLen = Math.max(existingChildren.length, newChildren.length);

        for (let i = 0; i < newChildren.length; i++) {
            const newBlock = this._findBlock(newBlocks, newChildren[i]);
            if (!newBlock) continue;

            if (i < existingChildren.length) {
                const existingBlock = this._findBlock(existingBlocks, existingChildren[i]);
                if (existingBlock && this._blockHasContentChanged(existingBlock, newBlock)) {
                    toUpdate.push({
                        blockId: existingBlock.block_id,
                        block: newBlock,
                        reason: 'Content changed at position ' + i
                    });
                }
            } else {
                toCreate.push({
                    parentId,
                    block: newBlock,
                    reason: 'New block at position ' + i
                });
            }
        }

        for (let i = newChildren.length; i < existingChildren.length; i++) {
            const existingBlock = this._findBlock(existingBlocks, existingChildren[i]);
            if (existingBlock) {
                toDelete.push({
                    blockId: existingBlock.block_id,
                    reason: 'Block removed at position ' + i
                });
            }
        }
    }

    _diffByKey(existingBlocks, newBlocks, existingChildren, newChildren, toUpdate, toCreate, toDelete) {
        const existingById = this._blocksById(existingBlocks);
        const pageBlock = existingBlocks.find(b => b.block_type === 1);
        const parentId = pageBlock ? pageBlock.block_id : null;

        const existingKeys = new Map();
        const matchedExisting = new Set();

        for (const childId of existingChildren) {
            const block = this._findBlock(existingBlocks, childId);
            if (block) {
                const key = this._blockKey(block);
                existingKeys.set(key, block);
            }
        }

        for (const childId of newChildren) {
            const newBlock = this._findBlock(newBlocks, childId);
            if (!newBlock) continue;

            const key = this._blockKey(newBlock);
            const existingBlock = existingKeys.get(key);

            if (existingBlock) {
                matchedExisting.add(existingBlock.block_id);
                if (this._blockHasContentChanged(existingBlock, newBlock)) {
                    toUpdate.push({
                        blockId: existingBlock.block_id,
                        block: newBlock,
                        reason: 'Content changed for key ' + key
                    });
                }
            } else {
                toCreate.push({
                    parentId,
                    block: newBlock,
                    reason: 'New block with key ' + key
                });
            }
        }

        for (const [key, block] of existingKeys) {
            if (!matchedExisting.has(block.block_id)) {
                toDelete.push({
                    blockId: block.block_id,
                    reason: 'Removed block with key ' + key
                });
            }
        }
    }

    _blocksById(blocks) {
        const map = new Map();
        for (const block of blocks) {
            if (block.block_id) map.set(block.block_id, block);
        }
        return map;
    }

    _findBlock(blocks, blockId) {
        return blocks.find(b => b.block_id === blockId);
    }

    _blockKey(block) {
        const typeName = (BLOCK_TYPES || [])[block.block_type] || 'unknown';
        const textContent = this._extractText(block);
        return `${typeName}:${textContent.slice(0, 60)}`;
    }

    _extractText(block) {
        const typeName = (BLOCK_TYPES || [])[block.block_type];
        if (!typeName) {
            if (block.text && block.text.elements) {
                return block.text.elements
                    .filter(e => e.text_run)
                    .map(e => e.text_run.content || '')
                    .join('');
            }
            return '';
        }
        const content = block[typeName];
        if (!content) {
            if (block.text && block.text.elements) {
                return block.text.elements
                    .filter(e => e.text_run)
                    .map(e => e.text_run.content || '')
                    .join('');
            }
            return '';
        }
        if (content.elements) {
            return content.elements
                .filter(e => e.text_run)
                .map(e => e.text_run.content || '')
                .join('');
        }
        if (typeof content === 'string') return content;
        return '';
    }

    _blockHasContentChanged(existingBlock, newBlock) {
        if (existingBlock.block_type !== newBlock.block_type) return true;

        const existingText = this._extractText(existingBlock);
        const newText = this._extractText(newBlock);
        if (existingText !== newText) return true;

        const stripMeta = (b) => {
            const { block_id, children, ...rest } = b;
            return rest;
        };
        return JSON.stringify(stripMeta(existingBlock)) !== JSON.stringify(stripMeta(newBlock));
    }
}

module.exports = BlockDiffer;