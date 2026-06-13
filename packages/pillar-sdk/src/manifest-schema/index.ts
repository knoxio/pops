export { ManifestPayloadSchema, type ManifestPayload } from './schema.js';
export {
  validateManifestPayload,
  checkContractPackageMatchesPillar,
  checkContractTagMatchesVersion,
  checkAiToolAllowedUriTypesAreDeclared,
  pathToDotted,
  type ValidationResult,
  type ValidationIssue,
} from './validate.js';
