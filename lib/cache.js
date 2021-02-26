const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

function getPlatformCacheFolderPath(platformsDir) {
    return path.join(platformsDir, 'tempPlugin/nativescript-images-generator-hook');
}

function getPlatformCacheFilePath(platformsDir, platform) {
    return path.join(getPlatformCacheFolderPath(platformsDir), `${platform}.nsimagesgenerator.json`);
}

async function getPlatformCache(platformsDir, platform) {
    const platformCacheFilePath = getPlatformCacheFilePath(platformsDir, platform);
    try {
        const cacheFile = await readFile(platformCacheFilePath, 'utf8');
        const cache = JSON.parse(cacheFile);

        // Integrity check
        if (cache.images == null || cache.output == null) {
            return {
                images: [],
                output: {},
            };
        }

        for (const image of cache.images) {
            // Default case
            image.dirty = false;

            if (
                image.filename == null ||
                image.basename == null ||
                image.hash == null ||
                image.scale == null ||
                cache.output[image.basename] == null ||
                cache.output[image.basename].length === 0
            ) {
                image.dirty = true;
                continue;
            }

            // Check that all output files exist
            for (const outputPath of cache.output[image.basename]) {
                try {
                    await stat(path.join(platformsDir, outputPath));
                } catch {
                    image.dirty = true;
                    break;
                }
            }
        }

        return cache;
    } catch (error) {
        if (error.code === 'ENOENT') {
            // No cache file generated yet
            return {
                images: [],
                output: {},
            };
        }

        throw new Error(`Unable to retrieve images generator cache file. (${error.message})`);
    }
}

async function savePlatformCache(cache, platformsDir, platform) {
    const platformCacheFilePath = getPlatformCacheFilePath(platformsDir, platform);
    const platformCacheFolderPath = getPlatformCacheFolderPath(platformsDir);

    // Sanitize cache before saving
    const filteredCache = {
        images: cache.images.map(image => ({
            filename: image.filename,
            basename: image.basename,
            hash: image.hash,
            scale: image.scale,
        })),
        output: cache.output,
    };
    fs.mkdir(platformCacheFolderPath, { recursive: true }, (error) => { 
        if (error) throw new Error(`Unable to create cache file folder. (${error.message})`);
    });
    try {
        // Creates the folder if does not exist
        
        await writeFile(platformCacheFilePath, JSON.stringify(filteredCache), 'utf8');
    } catch (error) {
        throw new Error(`Unable to save images generator cache file. (${error.message})`);
    }
}

module.exports = {
    getPlatformCache,
    savePlatformCache,
};
