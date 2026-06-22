/**
 * Dynamically load the admin boot module.
 * @param {() => Promise<unknown>} [importer]
 * @returns {Promise<unknown>}
 */
export function loadAdminBoot(importer = () => import('./boot.js')) {
  return importer();
}

/**
 * Start the admin page by loading the boot module.
 * @param {{importer?: () => Promise<unknown>}} [options]
 * @returns {Promise<unknown>}
 */
export function startAdminEntry(options = {}) {
  return loadAdminBoot(options.importer);
}

