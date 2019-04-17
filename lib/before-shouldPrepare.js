const {
    getAppImagesDirectoryPath,
    getImagesPathsList,
    getCacheDataForImagePath,
    getPlatformCache,
    isGenerateNeeded,
} = require('./generator');

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

        // Find input images
        const appImagesDirectoryPath = getAppImagesDirectoryPath(appResourcesDirectoryPath);
        const imagesPathsList = await getImagesPathsList(appImagesDirectoryPath);

        // Prepare hashes
        const currentImages = await Promise.all(imagesPathsList.map(imagePath => getCacheDataForImagePath(imagePath)));

        // Retrieve cache
        const cache = await getPlatformCache(platformsDir, platform);

        return isGenerateNeeded(currentImages, cache.images);
    }
}
