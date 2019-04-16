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
        return JSON.parse(cacheFile);
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

async function generate(currentImages, cachedImages, platformResourcesDirectoryPath, platform) {
    const currentBasenames = currentImages.map(currentImage => currentImage.basename);

    // Remove files not present anymore
    await Promise.all(cachedImages.map((cachedImage) => {
        if (!currentBasenames.contains(cachedImage.basename)) {
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
            return createImage(currentImage.filepath, currentImage.basename, platformResourcesDirectoryPath, platform);
        } else {
            return Promise.resolve();
        }
    }));
}

async function removeImage(basename, platformResourcesDirectoryPath, platform) {
    if (platform === 'ios') {
        const folderPath = path.join(platformResourcesDirectoryPath, `${basename}.imageset`);
        const files = await readdir(folderPath);
        await Promise.all(files.map(filename => unlink(path.join(folderPath, filename))))
        await rmdir(folderPath);
    } else if (platform === 'android') {
        await Promise.all(ANDROID_DRAWABLES_FOLDERS.map(drawable =>
            unlink(path.join(platformResourcesDirectoryPath, drawable, `${basename}.png`))));
    }
}

async function createImage(filepath, basename, platformResourcesDirectoryPath, platform) {
    const width = await getImageWidth(filepath);

    if (platform === 'ios') {
        const folderPath = path.join(platformResourcesDirectoryPath, `${basename}.imageset`);
        await mkdir(folderPath, { recursive: true });
        await writeFile(path.join(folderPath, 'Contents.json'), getIOSDataFileContent(basename));

        await resizeImage(filepath, path.join(folderPath, `${basename}.png`), width / 3);
        await resizeImage(filepath, path.join(folderPath, `${basename}@2x.png`), (width * 2) / 3);
        await resizeImage(filepath, path.join(folderPath, `${basename}@3x.png`), width);
    } else if (platform === 'android') {
        await resizeImage(filepath, path.join(platformResourcesDirectoryPath, 'drawable-ldpi', `${basename}.png`), width * 0.19);
        await resizeImage(filepath, path.join(platformResourcesDirectoryPath, 'drawable-mdpi', `${basename}.png`), width * 0.25);
        await resizeImage(filepath, path.join(platformResourcesDirectoryPath, 'drawable-hdpi', `${basename}.png`), width * 0.37);
        await resizeImage(filepath, path.join(platformResourcesDirectoryPath, 'drawable-xhdpi', `${basename}.png`), width * 0.5);
        await resizeImage(filepath, path.join(platformResourcesDirectoryPath, 'drawable-xxhdpi', `${basename}.png`), width * 0.75);
        await resizeImage(filepath, path.join(platformResourcesDirectoryPath, 'drawable-xxxhdpi', `${basename}.png`), width);
    }
}

async function getImageWidth(filepath) {
    const metadata = await sharp(filepath).metadata();
    return metadata.width;
}

async function resizeImage(inputPath, outputPath, width) {
    await sharp(inputPath).resize(Math.round(width)).toFile(outputPath);
}

function getIOSDataFileContent(basename) {
    return JSON.stringify({
        images: [
            {
                idiom : "universal",
                filename : `${basename}.png`,
                scale : "1x"
            },
            {
                idiom : "universal",
                filename : `${basename}@2x.png`,
                scale : "2x"
            },
            {
                idiom : "universal",
                filename : `${basename}@3x.png`,
                scale : "3x"
            }
        ],
        info: {
            version : 1,
            author : "xcode"
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
            resolve({
                filepath: imagePath,
                filename: path.basename(imagePath),
                basename: path.basename(imagePath, '.png'),
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

module.exports = async function($logger, $projectData, $usbLiveSyncService, hookArgs) {
    const { projectName, appResourcesDirectoryPath, platformsDir } = $projectData;
    const { platform } = hookArgs;

    if (platform !== 'ios' && platform !== 'android') {
        return Promise.resolve();
    }

    // Find input images
    const appImagesDirectoryPath = getAppImagesDirectoryPath(appResourcesDirectoryPath);
    const imagesPathsList = await getImagesPathsList(appImagesDirectoryPath);

    // Prepare hashes
    const currentImages = await Promise.all(imagesPathsList.map(imagePath => getCacheDataForImagePath(imagePath)));

    // Retrieve cache
    const cache = await getPlatformCache(platformsDir, platform);

    // Generate images
    const platformResourcesDirectoryPath = getPlatformResourcesDirectoryPath(platformsDir, platform, projectName);
    await generate(currentImages, cache.images, platformResourcesDirectoryPath, platform);

    // Save cache
    await savePlatformCache({
        images: currentImages.map(image => ({
            filename: image.filename,
            basename: image.basename,
            hash: image.hash,
        })),
    }, platformsDir, platform);
}
