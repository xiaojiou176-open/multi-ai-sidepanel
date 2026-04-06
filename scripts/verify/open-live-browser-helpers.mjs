export const buildAttachTargetUrls = ({
  identityPageUrl,
  startUrl,
  extensionWarmupUrl,
}) =>
  [identityPageUrl, startUrl, extensionWarmupUrl].filter(
    (targetUrl, index, allUrls) => Boolean(targetUrl) && allUrls.indexOf(targetUrl) === index
  );

export const buildOpenLiveBrowserArgs = ({
  cdpPort,
  userDataDir,
  profileDirectory,
  extensionPath,
  identityPageUrl,
  startUrl,
  extensionWarmupUrl,
}) => [
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${userDataDir}`,
  `--profile-directory=${profileDirectory}`,
  `--disable-extensions-except=${extensionPath}`,
  `--load-extension=${extensionPath}`,
  ...buildAttachTargetUrls({
    identityPageUrl,
    startUrl,
    extensionWarmupUrl,
  }),
];
