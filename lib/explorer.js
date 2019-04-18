const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);

async function getImages(appResourcesDirectoryPath) {
    // Find input images
    const appImagesDirectoryPath = getAppImagesDirectoryPath(appResourcesDirectoryPath);
    const imagesPathsList = await getImagesPathsList(appImagesDirectoryPath);

    // Prepare hashes
    const imagesMetadata = await Promise.all(imagesPathsList.map(imagePath => getMetadataForImagePath(imagePath)));

    // Remove duplicates and keep higher scale
    const filteredImagesMetadata = {};
    imagesMetadata.forEach((metadata) => {
        if (filteredImagesMetadata[metadata.basename] == null ||
            (filteredImagesMetadata[metadata.basename].scale < metadata.scale)) {
                filteredImagesMetadata[metadata.basename] = metadata;
        }
    });

    return Object.keys(filteredImagesMetadata).sort().map(key => filteredImagesMetadata[key]);
}

function getAppImagesDirectoryPath(appResourcesDirectoryPath) {
    return path.join(appResourcesDirectoryPath, 'images');
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

async function getMetadataForImagePath(imagePath) {
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

module.exports = {
    getImages,
};
