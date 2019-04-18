const { getImages } = require('./explorer');
const { getPlatformCache } = require('./cache');
const { isGenerateNeeded } = require('./generator');

module.exports = function (hookArgs) {
    if (hookArgs.shouldPrepareInfo == null || hookArgs.shouldPrepareInfo.platformInfo == null) {
        return;
    }

    const platformInfo = hookArgs.shouldPrepareInfo.platformInfo;

    return async (args, originalMethod) => {
        const originalShouldPrepare = await originalMethod(...args);
        if (originalShouldPrepare) {
            return true;
        }

        const { appResourcesDirectoryPath, platformsDir } = platformInfo.projectData;
        const platform = platformInfo.platform.toLowerCase();

        if (platform !== 'ios' && platform !== 'android') {
            return false;
        }

        // Get input images
        const images = getImages(appResourcesDirectoryPath);

        // Get cached images
        const { images: cachedImages } = getPlatformCache(platformsDir, platform);

        // Compare cache and images
        return isGenerateNeeded(images, cachedImages);
    }
}
