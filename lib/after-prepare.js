const {
    getAppImagesDirectoryPath,
    getImagesPathsList,
    getCacheDataForImagePath,
    getPlatformCache,
    getPlatformResourcesDirectoryPath,
    generate,
    savePlatformCache,
} = require('./generator');

module.exports = async function($logger, $projectData, $usbLiveSyncService, hookArgs) {
    const { projectName, appResourcesDirectoryPath, platformsDir } = $projectData;
    const platform = hookArgs.platform.toLowerCase();

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
