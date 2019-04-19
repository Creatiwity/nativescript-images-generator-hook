const { getImages } = require('./explorer');
const { getPlatformCache, savePlatformCache } = require('./cache');
const { generate } = require('./generator');

module.exports = async function($logger, $projectData, $usbLiveSyncService, hookArgs) {
    const { projectName, appResourcesDirectoryPath, platformsDir } = $projectData;
    const platform = hookArgs.platform.toLowerCase();

    if (platform !== 'ios' && platform !== 'android') {
        return Promise.resolve();
    }

    // Get input images
    const images = await getImages(appResourcesDirectoryPath);

    // Get cached images
    const { images: cachedImages } = await getPlatformCache(platformsDir, platform);

    // Generate images
    const output = await generate(images, cachedImages, platformsDir, platform, projectName);

    // Save cache
    await savePlatformCache({ images, output }, platformsDir, platform);
}
