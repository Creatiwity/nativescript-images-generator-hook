const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const crypto = require('crypto');
const sharp = require('sharp');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const rmdir = promisify(fs.rmdir);
const mkdir = promisify(fs.mkdir);

const ANDROID_DRAWABLES_FOLDERS = [
    'drawable-ldpi',
    'drawable-mdpi',
    'drawable-hdpi',
    'drawable-xhdpi',
    'drawable-xxhdpi',
    'drawable-xxxhdpi',
];

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
    try {
        await writeFile(platformCacheFilePath, JSON.stringify(cache), 'utf8');
    } catch (error) {
        throw new Error(`Unable to save images generator cache file. (${error.message})`);
    }
}

async function getImagesPathsList(resourcesPath) {
    try {
        const items = await readdir(resourcesPath, {
            encoding: 'utf8',
            withFileTypes: true,
        });

        return items
            .filter(item => item.isFile() && path.extname(item.name).toLowerCase() === '.png')
            .map(file => path.join(resourcesPath, file.name))
            .sort();
    } catch (error) {
        throw new Error(`Unable to list images in resources. (${error.message})`);
    }
}

function isGenerateNeeded(currentImages, cachedImages) {
    const currentBasenames = currentImages.map(currentImage => currentImage.basename);

    // Test removed files
    for (const cachedImage of cachedImages) {
        if (!currentBasenames.includes(cachedImage.basename)) {
            return true;
        }
    }

    const basenamesIndexedCache = {};
    cachedImages.forEach(cachedImage => basenamesIndexedCache[cachedImage.basename] = cachedImage);

    // Test new or changed files
    for (const currentImage of currentImages) {
        const cachedImage = basenamesIndexedCache[currentImage.basename];
        if (cachedImage == null || cachedImage.hash !== currentImage.hash) {
            return true;
        }
    }

    return false;
}

async function generate(currentImages, cachedImages, platformResourcesDirectoryPath, platform) {
    const currentBasenames = currentImages.map(currentImage => currentImage.basename);

    // Remove files not present anymore
    await Promise.all(cachedImages.map((cachedImage) => {
        if (!currentBasenames.includes(cachedImage.basename)) {
            return removeImage(cachedImage.basename, platformResourcesDirectoryPath, platform);
        } else {
            return Promise.resolve();
        }
    }));

    const basenamesIndexedCache = {};
    cachedImages.forEach(cachedImage => basenamesIndexedCache[cachedImage.basename] = cachedImage);

    // Add or replace new or changed files
    await Promise.all(currentImages.map((currentImage) => {
        const cachedImage = basenamesIndexedCache[currentImage.basename];
        if (cachedImage == null || cachedImage.hash !== currentImage.hash) {
            return createImage(
                currentImage.filepath,
                currentImage.basename,
                currentImage.scale,
                platformResourcesDirectoryPath,
                platform
            );
        } else {
            return Promise.resolve();
        }
    }));

    // Clear Sharp caching
    sharp.cache(false);
    sharp.cache(true);
}

async function removeImage(basename, platformResourcesDirectoryPath, platform) {
    if (platform === 'ios') {
        const folderPath = path.join(platformResourcesDirectoryPath, `${basename}.imageset`);

        try {
            const files = await readdir(folderPath);
            await Promise.all(files.map(filename => unlink(path.join(folderPath, filename))))
            await rmdir(folderPath);
        } catch {
            // Nothing to do if folder already deleted
        }
    } else if (platform === 'android') {
        try {
            await Promise.all(ANDROID_DRAWABLES_FOLDERS.map(drawable =>
                unlink(path.join(platformResourcesDirectoryPath, drawable, `${basename}.png`))));
        } catch {
            // Nothing to do if files already deleted
        }
    }
}

async function createImage(filepath, basename, scale, platformResourcesDirectoryPath, platform) {
    // x1 width
    const width = await getImageWidth(filepath, scale);

    if (platform === 'ios') {
        const folderPath = path.join(platformResourcesDirectoryPath, `${basename}.imageset`);
        await mkdir(folderPath, { recursive: true });
        await writeFile(path.join(folderPath, 'Contents.json'), getIOSDataFileContent(basename));

        await resizeImage(filepath, path.join(folderPath, `${basename}.png`), width);
        await resizeImage(filepath, path.join(folderPath, `${basename}@2x.png`), width * 2);
        await resizeImage(filepath, path.join(folderPath, `${basename}@3x.png`), width * 3);
    } else if (platform === 'android') {
        await resizeImage(filepath, path.join(platformResourcesDirectoryPath, 'drawable-ldpi', `${basename}.png`), width * 0.75);
        await resizeImage(filepath, path.join(platformResourcesDirectoryPath, 'drawable-mdpi', `${basename}.png`), width);
        await resizeImage(filepath, path.join(platformResourcesDirectoryPath, 'drawable-hdpi', `${basename}.png`), width * 1.5);
        await resizeImage(filepath, path.join(platformResourcesDirectoryPath, 'drawable-xhdpi', `${basename}.png`), width * 2);
        await resizeImage(filepath, path.join(platformResourcesDirectoryPath, 'drawable-xxhdpi', `${basename}.png`), width * 3);
        await resizeImage(filepath, path.join(platformResourcesDirectoryPath, 'drawable-xxxhdpi', `${basename}.png`), width * 4);
    }
}

async function getImageWidth(filepath, scale) {
    const metadata = await sharp(filepath).metadata();
    return metadata.width / scale;
}

async function resizeImage(inputPath, outputPath, width) {
    await sharp(inputPath).resize(Math.round(width)).toFile(outputPath);
}

function getIOSDataFileContent(basename) {
    return JSON.stringify({
        images: [
            {
                idiom: "universal",
                filename: `${basename}.png`,
                scale: "1x"
            },
            {
                idiom: "universal",
                filename: `${basename}@2x.png`,
                scale: "2x"
            },
            {
                idiom: "universal",
                filename: `${basename}@3x.png`,
                scale: "3x"
            }
        ],
        info: {
            version: 1,
            author: "xcode"
        }
    });
}

async function getCacheDataForImagePath(imagePath) {
    return new Promise((resolve, reject) => {
        const imageStream = fs.createReadStream(imagePath);
        const hash = crypto.createHash('md5');

        imageStream.on('data', (data) => {
            hash.update(data, 'utf8');
        });

        imageStream.on('end', () => {
            const basenameWithScale = path.basename(imagePath, '.png');
            const scaleIndex = basenameWithScale.lastIndexOf('@');

            let scale = 1;
            let basename = basenameWithScale;
            if (scaleIndex > 0) {
                const scaleStr = basenameWithScale.substring(scaleIndex + 1, scaleIndex + 2);

                if (['1', '2', '3', '4', '5'].includes(scaleStr)) {
                    scale = parseInt(scaleStr, 10);
                    basename = basenameWithScale.substring(0, scaleIndex);
                }
            }

            resolve({
                filepath: imagePath,
                filename: path.basename(imagePath),
                basename,
                scale,
                hash: hash.digest('hex'),
            });
        });

        imageStream.on('error', (error) => {
            reject(new Error(`Unable to get image data for caching. (${error.message})`));
        });
    });
}

function getAppImagesDirectoryPath(appResourcesDirectoryPath) {
    return path.join(appResourcesDirectoryPath, 'images');
}

function getPlatformResourcesDirectoryPath(platformsDir, platform, projectName) {
    if (platform === 'ios') {
        return path.join(platformsDir, platform, projectName, 'Resources/Assets.xcassets');
    } else if (platform === 'android') {
        return path.join(platformsDir, platform, 'app/src/main/res');
    }
}

module.exports = {
    getAppImagesDirectoryPath,
    getImagesPathsList,
    getCacheDataForImagePath,
    getPlatformCache,
    getPlatformResourcesDirectoryPath,
    isGenerateNeeded,
    generate,
    savePlatformCache,
};
