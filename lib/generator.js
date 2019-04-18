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
    'drawable-ldpi',
    'drawable-mdpi',
    'drawable-hdpi',
    'drawable-xhdpi',
    'drawable-xxhdpi',
    'drawable-xxxhdpi',
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
        if (cachedImage == null || cachedImage.hash !== currentImage.hash) {
            return true;
        }
    }

    return false;
}

async function generate(currentImages, cachedImages, platformsDir, platform, projectName) {
    const platformResourcesDirectoryPath = getPlatformResourcesDirectoryPath(platformsDir, platform, projectName);
    const currentBasenames = currentImages.map(currentImage => currentImage.basename);

    // Remove files not present anymore
    await Promise.all(cachedImages.map((cachedImage) => {
        if (!currentBasenames.includes(cachedImage.basename)) {
            return removeImage(cachedImage, platformResourcesDirectoryPath, platform);
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
                currentImage,
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
                unlink(path.join(platformResourcesDirectoryPath, drawable, `${basename}.png`))));
        } catch {
            // Nothing to do if files already deleted
        }
    }
}

async function createImage({ filepath, basename, scale }, platformResourcesDirectoryPath, platform) {
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

function getPlatformResourcesDirectoryPath(platformsDir, platform, projectName) {
    if (platform === 'ios') {
        return path.join(platformsDir, platform, projectName, 'Resources/Assets.xcassets');
    } else if (platform === 'android') {
        return path.join(platformsDir, platform, 'app/src/main/res');
    }
}

module.exports = {
    isGenerateNeeded,
    generate,
};
