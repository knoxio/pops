import { createBaseConfig } from '../../eslint.config.base.mjs';

export default [
  ...createBaseConfig({ react: true }),
  {
    // Import wizard components are complex multi-step forms
    files: ['src/components/imports/**/*.{ts,tsx}'],
    rules: {
      'max-lines': ['error', { max: 1600, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 650, skipBlankLines: true, skipComments: true, IIFEs: true }],
      complexity: ['error', 50],
    },
  },
  {
    // ReviewStep and CorrectionProposalDialog are large multi-section components
    files: ['src/components/imports/ReviewStep.tsx', 'src/components/imports/CorrectionProposalDialog.tsx'],
    rules: {
      'max-lines-per-function': ['error', { max: 860, skipBlankLines: true, skipComments: true, IIFEs: true }],
    },
  },
];
