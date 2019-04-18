const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

function getPlatformCacheFilePath(platformsDir, platform) {
    return path.join(platformsDir, platform, '.nsimagesgenerator.json');
}

async function getPlatformCache(platformsDir, platform) {
    const platformCacheFilePath = getPlatformCacheFilePath(platformsDir, platform);
    try {
        const cacheFile = await readFile(platformCacheFilePath, 'utf8');
        const cache = JSON.parse(cacheFile);

        // Integrity check
        if (cache.images == null) {
            return { images: [] };
        }

        cache.images = cache.images.filter(image =>
            image.filename != null &&
            image.basename != null &&
            image.hash != null &&
            image.scale != null);

        return cache;
    } catch (error) {
        if (error.code === 'ENOENT') {
            // No cache file generated yet
            return { images: [] };
        }

        throw new Error(`Unable to retrieve images generator cache file. (${error.message})`);
    }
}

async function savePlatformCache(cache, platformsDir, platform) {
    const platformCacheFilePath = getPlatformCacheFilePath(platformsDir, platform);

    // Sanitize cache before saving
    const filteredCache = { images: cache.images.map(image => ({
        filename: image.filename,
        basename: image.basename,
        hash: image.hash,
        scale: image.scale,
    })) };

    try {
        await writeFile(platformCacheFilePath, JSON.stringify(filteredCache), 'utf8');
    } catch (error) {
        throw new Error(`Unable to save images generator cache file. (${error.message})`);
    }
}

module.exports = {
    getPlatformCache,
    savePlatformCache,
};
