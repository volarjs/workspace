import * as path from 'path';
import { createLinter, createProject } from '../framework/packages/kit';
import createTsService from '../services/packages/typescript';

(async () => {
	const project = createProject(path.resolve(__dirname, '../tsconfig.lint.json'));
	const linter = createLinter({
		services: {
			typescript: createTsService(),
		},
		rules: {
			'no-import-typescript': (await import('../rules/no-import-module')).default('typescript', 'typescript/lib/tsserverlibrary'),
			'type-only-tsserverlibrary': (await import('../rules/should-type-only-import')).default('typescript/lib/tsserverlibrary'),
		},
	}, project.languageServiceHost);

	for (const fileName of project.languageServiceHost.getScriptFileNames()) {
		const errors = (await linter.check(fileName))
			.filter(e => e.source === 'no-import-typescript' || e.source === 'type-only-tsserverlibrary');
		if (errors.length) {
			linter.logErrors(fileName, errors);
		}
	}
})();
