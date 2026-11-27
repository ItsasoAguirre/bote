// Commit messages follow Conventional Commits (https://www.conventionalcommits.org), in English.
// Checked on every commit by the husky commit-msg hook. See CONTRIBUTING.md.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Suggested scopes (parts of the app). An unknown scope only warns (level 1).
    'scope-enum': [
      1,
      'always',
      [
        'expenses',
        'incomes',
        'groups',
        'loans',
        'stats',
        'export',
        'notifications',
        'invites',
        'recurring',
        'ui',
        'db',
        'web',
        'env',
        'build',
        'deps',
        'i18n',
      ],
    ],
  },
};
