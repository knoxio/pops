import { createBaseConfig } from '../../eslint.config.base.mjs';

export default createBaseConfig({
  react: true,
  ignores: ['playwright-report', 'test-results'],
});
