import type { Rule } from '../framework/packages/language-service';
import type { Provide } from '../services/packages/typescript';
import { getImportModuleName } from './missing-dependency';
import { posix as path } from 'path';
import * as jsonc from 'jsonc-parser';
import { globSync } from 'glob';

interface ProjectConfig {
	fields?: string[];
	typeOnlyFields?: string[];
	ignore?: string[];
	extra?: string[];
}

export default (configs: Record<string, ProjectConfig> = {}): Rule<Provide> => ({
	run(document, { report, inject, env }) {

		if (!document.uri.endsWith('/package.json'))
			return;

		const packageJsonPath = env.uriToFileName(document.uri);
		const projectConfig = configs[path.relative(process.cwd(), packageJsonPath)] ?? {};
		const packageJsonAst = jsonc.parseTree(document.getText());

		projectConfig.fields ??= ['dependencies', 'peerDependencies'];
		projectConfig.typeOnlyFields ??= ['devDependencies'];
		projectConfig.ignore ??= [];
		projectConfig.extra ??= [];

		const ts = inject('typescript/typescript');
		const languageServiceHost = inject('typescript/languageServiceHost');
		const languageService = inject('typescript/languageService');
		const program = languageService.getProgram()!;
		const usedModules = new Set<string>();
		const usedTypes = new Set<string>();

		let extraFiles: string[] = [];

		for (const file of projectConfig.extra) {
			const search = path.resolve(path.dirname(packageJsonPath), file);
			extraFiles = extraFiles.concat(globSync(search, { nodir: true }));
		}

		for (const fileName of [
			...extraFiles,
			...languageServiceHost.getScriptFileNames(),
		]) {

			let sourceFile = program.getSourceFile(fileName);

			if (!sourceFile) {
				const snapshot = languageServiceHost.getScriptSnapshot(fileName);
				sourceFile = ts.createSourceFile(fileName, snapshot.getText(0, snapshot.getLength()), ts.ScriptTarget.Latest);
			}

			sourceFile.forEachChild(function visit(node) {
				let moduleName: string | undefined;
				if (
					ts.isImportDeclaration(node) &&
					ts.isStringLiteral(node.moduleSpecifier) &&
					(moduleName = getImportModuleName(node.moduleSpecifier.text))
				) {
					if (node.importClause.isTypeOnly) {
						usedTypes.add(moduleName);
					}
					else {
						usedModules.add(moduleName);
					}
					if (!moduleName.startsWith('@')) {
						usedTypes.add('@types/' + moduleName);
					}
				}
				if (
					ts.isCallExpression(node) &&
					ts.isIdentifier(node.expression) &&
					node.expression.text === 'require' &&
					node.arguments.length === 1 &&
					ts.isStringLiteral(node.arguments[0]) &&
					(moduleName = getImportModuleName(node.arguments[0].text))
				) {
					usedModules.add(moduleName);
				}
				node.forEachChild(visit);
			});
		}

		if (packageJsonAst.children) {
			for (const root of packageJsonAst.children) {
				for (let i = 0; i < root.children?.length ?? 0; i++) {
					const deps = root.children[i];
					if (deps.type === 'string' && (projectConfig.fields.includes(deps.value) || projectConfig.typeOnlyFields.includes(deps.value))) {
						if (root.children[i + 1].type === 'object') {
							for (const dep of root.children[i + 1].children ?? []) {
								const depName = dep.children?.[0].value;
								if (
									!projectConfig.ignore.includes(depName) &&
									(projectConfig.typeOnlyFields.includes(deps.value) && !usedTypes.has(depName) && !usedModules.has(depName))
								) {
									report({
										message: `Unused type only dependency`,
										range: {
											start: document.positionAt(dep.offset),
											end: document.positionAt(dep.offset + dep.length),
										},
										severity: 1,
									});
								}
								if (
									!projectConfig.ignore.includes(depName) &&
									(projectConfig.fields.includes(deps.value) && !usedModules.has(depName))
								) {
									report({
										message: `Unused runtime dependency`,
										range: {
											start: document.positionAt(dep.offset),
											end: document.positionAt(dep.offset + dep.length),
										},
										severity: 1,
									});
								}
							}
						}
					}
				}
			}
		}
	},
});
