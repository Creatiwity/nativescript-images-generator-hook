const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const rmdir = promisify(fs.rmdir);

const ANDROID_DRAWABLES_FOLDERS = [
    { name: 'drawable-mdpi', scale: 1 },
    { name: 'drawable-hdpi', scale: 1.5 },
    { name: 'drawable-xhdpi', scale: 2 },
    { name: 'drawable-xxhdpi', scale: 3 },
    { name: 'drawable-xxxhdpi', scale: 4 },
];

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
        if (
            cachedImage == null ||
            cachedImage.dirty ||
            cachedImage.hash !== currentImage.hash ||
            cachedImage.scale !== currentImage.scale
        ) {
            return true;
        }
    }

    return false;
}

async function generate(currentImages, cachedImages, platformsDir, platform, projectName) {
    const platformResourcesDirectoryPath = getPlatformResourcesDirectoryPath(platformsDir, platform);
    const currentBasenames = currentImages.map(currentImage => currentImage.basename);

    // Remove files not present anymore
    await Promise.all(cachedImages.map((cachedImage) => {
        if (!currentBasenames.includes(cachedImage.basename)) {
            return removeImage(cachedImage, platformResourcesDirectoryPath, platform);
        } else {
            return Promise.resolve();
        }
    }));

    const output = {};
    const basenamesIndexedCache = {};
    cachedImages.forEach(cachedImage => basenamesIndexedCache[cachedImage.basename] = cachedImage);

    // Add or replace new or changed files
    await Promise.all(currentImages.map((currentImage) => {
        const cachedImage = basenamesIndexedCache[currentImage.basename];
        const resizedImages = getResizedImages(currentImage, platform, projectName);

        output[currentImage.basename] = resizedImages.map(resizedImage => resizedImage.path);

        if (
            cachedImage == null ||
            cachedImage.dirty ||
            cachedImage.hash !== currentImage.hash ||
            cachedImage.scale !== currentImage.scale
        ) {
            return createImage(currentImage, resizedImages, platformsDir, platform);
        } else {
            return Promise.resolve();
        }
    }));

    // Clear Sharp caching
    sharp.cache(false);
    sharp.cache(true);

    return output;
}

async function removeImage({ basename }, platformResourcesDirectoryPath, platform) {
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
                unlink(path.join(platformResourcesDirectoryPath, drawable.name, `${basename}.png`))));
        } catch {
            // Nothing to do if files already deleted
        }
    }
}

function getResizedImages({ basename }, platform, projectName) {
    const relativePath = getPlatformRelativeResourcesDirectoryPath(platform);

    if (platform === 'ios') {
        const folderPath = path.join(relativePath, `${basename}.imageset`);

        return [
            { path: path.join(folderPath, `${basename}.png`), scale: 1 },
            { path: path.join(folderPath, `${basename}@2x.png`), scale: 2 },
            { path: path.join(folderPath, `${basename}@3x.png`), scale: 3 },
        ]
    } else if (platform === 'android') {
        return ANDROID_DRAWABLES_FOLDERS.map(drawable => ({
            path: path.join(relativePath, drawable.name, `${basename}.png`),
            scale: drawable.scale,
        }));
    }
}

async function createImage({ filepath, basename, scale }, resizedImages, platformsDir, platform) {
    if (platform === 'ios') {
        const platformResourcesDirectoryPath = getPlatformResourcesDirectoryPath(platformsDir, platform);
        const folderPath = path.join(platformResourcesDirectoryPath, `${basename}.imageset`);
        await mkdir(folderPath, { recursive: true });
        await writeFile(path.join(folderPath, 'Contents.json'), getIOSDataFileContent(basename));
    }

    // x1 width
    const width = await getImageWidth(filepath, scale);

    for (const resizedImage of resizedImages) {
        await resizeImage(filepath, path.join(platformsDir, platform, resizedImage.path), width * resizedImage.scale);
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

function getPlatformRelativeResourcesDirectoryPath(platform) {
    if (platform === 'ios') {
        return 'Assets.xcassets';
    } else if (platform === 'android') {
        return 'src/main/res';
    }
}

function getPlatformResourcesDirectoryPath(platformsDir, platform) {
    return path.join(platformsDir, platform, getPlatformRelativeResourcesDirectoryPath(platform));
}

module.exports = {
    isGenerateNeeded,
    generate,
};
