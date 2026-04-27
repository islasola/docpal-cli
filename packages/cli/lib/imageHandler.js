/**
 * Image handling for MDX writer.
 * Creates a resolveImage callback that downloads images from Feishu
 * and uploads to S3, OSS, or saves locally.
 *
 * Supports: regular images, board/whiteboard previews, Figma iframe screenshots.
 * Features: hash-based deduplication, sharp border trimming, rate limiting.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Bottleneck = require('bottleneck');

const IMAGE_BED_URL = process.env.IMAGE_BED_URL || 'https://zdoc-images.s3.us-west-2.amazonaws.com';

// Rate limiters for uploads
const s3Limiter = new Bottleneck({ maxConcurrent: 1, minTime: 52 });
const ossLimiter = new Bottleneck({ maxConcurrent: 1, minTime: 52 });
const figmaLimiter = new Bottleneck({ maxConcurrent: 1, minTime: 100 });

// Content hash cache for deduplication
const hashCache = new Map();

/**
 * Create an image resolver function suitable for passing to mdxWriter.
 * @param {Object} config
 * @param {'s3'|'oss'|'local'} config.mode - Upload destination.
 * @param {Object} [config.s3] - S3 config { bucket, prefix, region, publicUrl, accessKeyId, secretAccessKey }
 * @param {Object} [config.oss] - OSS config { region, accessKeyId, accessKeySecret, bucket, endpoint, prefix, publicUrl }
 * @param {Object} [config.local] - Local config { outputDir, publicPath }
 * @param {boolean} [config.trimWhiteBorder=false] - Trim white borders with sharp.
 * @param {Function} config.downloadFn - async (fileToken) => Buffer
 * @param {Function} [config.downloadBoardFn] - async (boardToken) => Buffer (defaults to downloadFn)
 * @param {Function} [config.uploadFn] - async (buffer, key) => void (cloud upload)
 * @param {Function} [config.slugFn] - (fileToken, blockMeta) => string (filename without extension)
 * @param {string} [config.figmaApiKey] - API key for Figma screenshot downloads
 * @returns {Function} - async (fileToken, blockMeta) => string URL
 */
function createImageResolver(config = {}) {
    const {
        mode = 'local',
        s3 = {},
        oss = {},
        local = {},
        trimWhiteBorder = false,
        downloadFn,
        downloadBoardFn,
        uploadFn,
        slugFn,
        figmaApiKey,
    } = config;

    const s3PublicUrl = s3.publicUrl || IMAGE_BED_URL;
    const s3Prefix = s3.prefix || 'img/docs/';
    const ossPrefix = oss.prefix || 'img/docs/';
    const ossPublicUrl = oss.publicUrl || '';
    const localOutputDir = local.outputDir || './static/img';
    const localPublicPath = local.publicPath || '/img';

    return async function resolveImage(fileToken, blockMeta = {}) {
        if (!downloadFn) {
            // No download function — return placeholder
            return `${s3PublicUrl}/${s3Prefix}${fileToken}.png`;
        }

        const slug = slugFn
            ? slugFn(fileToken, blockMeta)
            : generateImageSlug(fileToken, blockMeta);

        const filename = `${slug}.png`;

        try {
            let buffer;

            // Handle board/whiteboard blocks differently
            if (blockMeta.isBoard && downloadBoardFn) {
                buffer = await downloadBoardFn(fileToken);
            } else {
                buffer = await downloadFn(fileToken);
            }

            // Optional: trim white borders (useful for board previews)
            if (trimWhiteBorder) {
                buffer = await trimWhiteBorders(buffer);
            }

            if (mode === 's3') {
                return await uploadToS3(buffer, filename, s3Prefix, s3PublicUrl, uploadFn);
            } else if (mode === 'oss') {
                return await uploadToOSS(buffer, filename, ossPrefix, ossPublicUrl, uploadFn);
            } else {
                // Local mode
                const outputPath = path.join(localOutputDir, filename);
                fs.mkdirSync(path.dirname(outputPath), { recursive: true });
                fs.writeFileSync(outputPath, buffer);
                return `${localPublicPath}/${filename}`;
            }
        } catch (err) {
            console.error(`Failed to process image ${fileToken}: ${err.message}`);
            // Return a fallback URL so the MDX is still valid
            return `${s3PublicUrl}/${s3Prefix}${filename}`;
        }
    };
}

/**
 * Create a Figma iframe screenshot resolver.
 * @param {Object} config
 * @param {string} config.figmaApiKey - Figma API key
 * @param {Function} config.uploadFn - Upload function for the resolved image
 * @param {string} config.mode - Upload mode (s3/oss/local)
 * @param {Object} config.s3 - S3 config
 * @param {Object} config.oss - OSS config
 * @param {Object} config.local - Local config
 * @returns {Function} - async (figmaUrl, blockMeta) => string URL
 */
function createFigmaResolver(config = {}) {
    const {
        figmaApiKey = process.env.FIGMA_API_KEY,
        mode = 'local',
        s3 = {},
        oss = {},
        local = {},
        uploadFn,
    } = config;

    const s3PublicUrl = s3.publicUrl || IMAGE_BED_URL;
    const s3Prefix = s3.prefix || 'img/docs/';
    const localOutputDir = local.outputDir || './static/img';
    const localPublicPath = local.publicPath || '/img';

    return async function resolveFigma(figmaUrl, blockMeta = {}) {
        if (!figmaApiKey) {
            console.warn('FIGMA_API_KEY not set, skipping Figma screenshot');
            return figmaUrl;
        }

        return figmaLimiter.schedule(async () => {
            try {
                const fetch = require('node-fetch');
                const figmaKey = extractFigmaKey(figmaUrl);
                if (!figmaKey) return figmaUrl;

                const apiUrl = `https://api.figma.com/v1/images/${figmaKey}?format=png`;
                const res = await fetch(apiUrl, {
                    headers: { 'X-Figma-Token': figmaApiKey }
                });
                const data = await res.json();

                const imageUrl = data.images && data.images[figmaKey];
                if (!imageUrl) return figmaUrl;

                // Download the rendered image
                const imgRes = await fetch(imageUrl);
                if (!imgRes.ok) return figmaUrl;
                const buffer = await imgRes.buffer();

                const slug = `figma-${crypto.createHash('md5').update(figmaKey).digest('hex').slice(0, 12)}`;
                const filename = `${slug}.png`;

                if (mode === 's3') {
                    return await uploadToS3(buffer, filename, s3Prefix, s3PublicUrl, uploadFn);
                } else if (mode === 'oss') {
                    return await uploadToOSS(buffer, filename, s3Prefix, s3PublicUrl, uploadFn);
                } else {
                    const outputPath = path.join(localOutputDir, filename);
                    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
                    fs.writeFileSync(outputPath, buffer);
                    return `${localPublicPath}/${filename}`;
                }
            } catch (err) {
                console.error(`Failed to download Figma image: ${err.message}`);
                return figmaUrl;
            }
        });
    };
}

/**
 * Upload to S3 with hash-based deduplication.
 */
async function uploadToS3(buffer, filename, prefix, publicUrl, uploadFn) {
    const key = `${prefix}${filename}`;
    const hash = crypto.createHash('md5').update(buffer).digest('hex');

    // Skip upload if we already uploaded this exact content
    if (hashCache.get(key) === hash) {
        return `${publicUrl}/${key}`;
    }

    if (uploadFn) {
        await s3Limiter.schedule(() => uploadFn(buffer, key));
    }
    hashCache.set(key, hash);
    return `${publicUrl}/${key}`;
}

/**
 * Upload to Alibaba Cloud OSS with hash-based deduplication.
 */
async function uploadToOSS(buffer, filename, prefix, publicUrl, uploadFn) {
    const key = `${prefix}${filename}`;
    const hash = crypto.createHash('md5').update(buffer).digest('hex');

    if (hashCache.get(key) === hash) {
        return `${publicUrl}/${key}`;
    }

    if (uploadFn) {
        await ossLimiter.schedule(() => uploadFn(buffer, key));
    }
    hashCache.set(key, hash);
    return `${publicUrl}/${key}`;
}

/**
 * Generate a deterministic image slug from token and caption.
 */
function generateImageSlug(fileToken, blockMeta = {}) {
    const caption = blockMeta.caption || '';
    if (caption && caption.length > 0 && caption.length < 100) {
        return caption
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60);
    }
    const hash = crypto.createHash('md5').update(fileToken).digest('hex').slice(0, 12);
    return `img-${hash}`;
}

/**
 * Trim white borders from image buffer using sharp.
 * Optional — only runs if sharp is installed.
 */
async function trimWhiteBorders(buffer) {
    try {
        const sharp = require('sharp');
        const trimmed = await sharp(buffer)
            .trim({ threshold: 10 })
            .png()
            .toBuffer();
        return trimmed;
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
            console.warn('sharp not installed, skipping white border trim');
            return buffer;
        }
        throw err;
    }
}

/**
 * Extract Figma file key from URL.
 */
function extractFigmaKey(url) {
    if (!url) return null;
    const match = url.match(/\/file\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

/**
 * Create an OSS upload function using ali-oss package.
 * @param {Object} config
 * @returns {Function} - async (buffer, key) => void
 */
function createOSSUploader(config = {}) {
    return async function uploadToCloud(buffer, key) {
        const OSS = require('ali-oss');
        const client = new OSS({
            region: config.region || process.env.OSS_REGION,
            accessKeyId: config.accessKeyId || process.env.OSS_ACCESS_KEY_ID,
            accessKeySecret: config.accessKeySecret || process.env.OSS_ACCESS_KEY_SECRET,
            bucket: config.bucket || process.env.OSS_BUCKET,
            endpoint: config.endpoint || process.env.OSS_ENDPOINT,
        });
        await client.put(key, buffer);
    };
}

/**
 * Create an S3 upload function using @aws-sdk/client-s3.
 * @param {Object} config
 * @returns {Function} - async (buffer, key) => void
 */
function createS3Uploader(config = {}) {
    return async function uploadToCloud(buffer, key) {
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        const client = new S3Client({
            region: config.region || process.env.AWS_REGION || 'us-west-2',
            credentials: {
                accessKeyId: config.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        await client.send(new PutObjectCommand({
            Bucket: config.bucket || process.env.AWS_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: 'image/png',
        }));
    };
}

/**
 * Create an image resolver for MarkdownToFeishu that downloads images from URLs
 * and uploads them to Feishu Drive for use in docx documents.
 * @param {Object} config
 * @param {Function} config.uploadMedia - async (buffer, filename, parentType, parentNode) => { file_token }
 * @returns {Function} - async (url, { documentId }) => { file_key }
 */
function createFeishuUploadResolver(config = {}) {
    const { uploadMedia } = config;

    return async function resolveImage(url, options = {}) {
        if (!uploadMedia) {
            console.warn('No uploadMedia function provided, skipping image upload');
            return null;
        }

        const documentId = options.documentId;
        if (!documentId) {
            console.warn('No documentId provided, skipping image upload');
            return null;
        }

        // Only handle absolute HTTP(S) URLs for now
        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
            console.warn(`Skipping image upload for non-HTTP URL: ${url}`);
            return null;
        }

        try {
            const fetch = require('node-fetch');
            const res = await fetch(url);
            if (!res.ok) {
                console.warn(`Failed to download image: ${res.status} ${url}`);
                return null;
            }

            const buffer = await res.buffer();
            const urlPath = new URL(url).pathname;
            const filename = urlPath.split('/').pop() || 'image.png';
            const ext = path.extname(filename) || '.png';
            const safeFilename = `img-${crypto.createHash('md5').update(buffer).digest('hex').slice(0, 12)}${ext}`;

            const result = await uploadMedia(buffer, safeFilename, 'docx_image', documentId);
            if (result && result.file_token) {
                return { file_key: result.file_token };
            }
            console.warn(`Upload succeeded but no file_token returned for ${url}`);
            return null;
        } catch (err) {
            console.warn(`Failed to process image ${url}: ${err.message}`);
            return null;
        }
    };
}

module.exports = {
    createImageResolver,
    createFigmaResolver,
    createFeishuUploadResolver,
    createS3Uploader,
    createOSSUploader,
    generateImageSlug,
    trimWhiteBorders,
    extractFigmaKey,
};
