export {
  ManifestPayloadSchema,
  type ManifestPayload,
  type SinkDescriptor,
  type SettingsManifestDescriptor,
  type NavConfigDescriptor,
  type NavItemDescriptor,
  type PageDescriptor,
} from './schema.js';
export {
  validateManifestPayload,
  checkContractPackageMatchesPillar,
  checkContractTagMatchesVersion,
  checkAiToolAllowedUriTypesAreDeclared,
  checkSearchAdapterProceduresAreDeclared,
  pathToDotted,
  type ValidationResult,
  type ValidationIssue,
} from './validate.js';
