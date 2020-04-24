const { getImages } = require('./explorer');
const { getPlatformCache, savePlatformCache } = require('./cache');
const { generate } = require('./generator');

module.exports = async function($projectData, $logger, hookArgs) {
    $logger.info('[ImageGenerator] Assets generation starting...');

    const { appResourcesDirectoryPath, platformsDir } = $projectData;
    const platform = hookArgs.prepareData.platform.toLowerCase();

    if (platform !== 'ios' && platform !== 'android') {
        return Promise.resolve();
    }

    // Get input images
    const images = await getImages(appResourcesDirectoryPath);

    // Get cached images
    const { images: cachedImages } = await getPlatformCache(platformsDir, platform);

    // Generate images
    const output = await generate(images, cachedImages, appResourcesDirectoryPath, platform);

    // Save cache
    await savePlatformCache({ images, output }, platformsDir, platform);

    $logger.info('[ImageGenerator] Assets generation finished.');
}
