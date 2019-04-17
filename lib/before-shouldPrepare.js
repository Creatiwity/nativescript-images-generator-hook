const {
    getAppImagesDirectoryPath,
    getImagesPathsList,
    getCacheDataForImagePath,
    getPlatformCache,
    isGenerateNeeded,
} = require('./generator');

module.exports = function ($projectData, hookArgs) {
    if (hookArgs.shouldPrepareInfo == null || hookArgs.shouldPrepareInfo.platformInfo == null) {
        return;
    }

    const platformInfo = hookArgs.shouldPrepareInfo.platformInfo;

    if (platformInfo.appFilesUpdaterOptions && platformInfo.appFilesUpdaterOptions.bundle) {
        return (args, originalMethod) => {
            const originalShouldPrepare = await originalMethod(...args);
            if (originalShouldPrepare) {
                return true;
            }

            const { projectName, appResourcesDirectoryPath, platformsDir } = $projectData;
            const { platform } = hookArgs;

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

            return isGenerateNeeded(currentImages, cache);
        }
    }
}
