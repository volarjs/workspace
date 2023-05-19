import type { Rule } from '../framework/packages/language-service';
import type { Provide } from '../services/packages/typescript';
import { posix as path } from 'path';
import * as fs from 'fs';

interface ProjectConfig {
	fields?: string[];
	ignore?: string[];
}

export default (ignores: Record<string, ProjectConfig> = {}): Rule<Provide> => ({
	run(document, { report, inject, env }) {

		const ts = inject('typescript/typescript');
		const sourceFile = inject('typescript/sourceFile', document);
		if (!sourceFile)
			return;

		const packageJsonPath = searchPackageJson(path.dirname(env.uriToFileName(document.uri)));
		if (!packageJsonPath)
			return;

		const projectConfig = ignores[path.relative(process.cwd(), packageJsonPath)] ?? {};
		const packageJson = require(packageJsonPath);

		projectConfig.fields ??= ['dependencies', 'peerDependencies'];
		projectConfig.ignore ??= [];

		sourceFile.forEachChild(function visit(node) {
			let moduleName: string | undefined;
			if (
				ts.isImportDeclaration(node) &&
				ts.isStringLiteral(node.moduleSpecifier) &&
				node.importClause.isTypeOnly === false &&
				(moduleName = getImportModuleName(node.moduleSpecifier.text)) &&
				!projectConfig.ignore.includes(moduleName) &&
				!projectConfig.fields.some(field => packageJson[field]?.[moduleName])
			) {
				report({
					message: `Missing dependency "${moduleName}" in ${path.relative(process.cwd(), packageJsonPath)} fields: ${projectConfig.fields.join(', ') || 'none'}}`,
					range: {
						start: document.positionAt(node.moduleSpecifier.getStart(sourceFile)),
						end: document.positionAt(node.moduleSpecifier.getEnd()),
					},
					severity: 1,
				});
			}
			node.forEachChild(visit);
		});
	},
});

function getImportModuleName(importText: string) {
	if (importText.startsWith('.')) {
		return undefined;
	}
	let moduleName = importText.split('/')[0];
	if (moduleName.startsWith('@')) {
		moduleName += '/' + importText.split('/')[1];
	}
	return moduleName;
}

const searchCache = new Map<string, string | undefined>();

function searchPackageJson(dir: string) {
	if (searchCache.has(dir)) {
		return searchCache.get(dir);
	}

	let result: string | undefined;
	const packageJsonPath = path.join(dir, 'package.json');
	if (fs.existsSync(packageJsonPath)) {
		result = packageJsonPath;
	}
	else {
		result = searchPackageJson(path.dirname(dir));
	}

	searchCache.set(dir, result);
	return result;
}
