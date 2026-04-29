/**
 * Feature toggles module (PRD-094).
 */
export { featuresRegistry, FeaturesRegistry } from './registry.js';
export {
  clearUserPreference,
  FeatureGateError,
  FeatureNotFoundError,
  FeatureScopeError,
  isEnabled,
  listFeatures,
  setFeatureEnabled,
  setUserPreference,
} from './service.js';
export { featuresRouter } from './router.js';
